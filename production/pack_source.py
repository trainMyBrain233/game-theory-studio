#!/usr/bin/env python3
"""Archive the unified public source candidate list after the same source guard as CI."""
from pathlib import Path, PurePosixPath
import argparse
import hashlib
import importlib.util
import json
import os
import re
import stat
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
MAX_ARCHIVE_BYTES = 15 * 1024 * 1024
MAX_SOURCE_BYTES = 1024 * 1024


class ArchiveBuildError(ValueError):
    """A public archive failed a publication check; the previous ZIP is retained."""


# Reuse this checkout's self-contained guard; never import a guard from an
# archive or caller-supplied source directory. The verifier remains independent.
_spec = importlib.util.spec_from_file_location('packing_source_guard', ROOT / 'scripts/qa_source.py')
_source_guard = importlib.util.module_from_spec(_spec)
_previous_bytecode = sys.dont_write_bytecode
try:
    sys.dont_write_bytecode = True
    _spec.loader.exec_module(_source_guard)
finally:
    sys.dont_write_bytecode = _previous_bytecode
portable_path_collision = _source_guard.portable_path_collision


def validate_source_path(name):
    """Keep the packer's public error type while sharing QA's path contract."""
    try:
        _source_guard.validate_source_path(name)
    except ValueError as error:
        raise ArchiveBuildError(str(error)) from None


def source_candidates(root, git_output):
    """Validate the entire list before selecting or reading candidate files."""
    try:
        candidates = sorted({item.decode('utf-8') for item in git_output.split(b'\0') if item})
    except UnicodeDecodeError:
        raise ArchiveBuildError('Public source filenames must be UTF-8') from None
    portable_paths = {}
    for name in candidates:
        validate_source_path(name)
        if portable_path_collision(name, portable_paths):
            raise ArchiveBuildError('Public source filenames collide after portable normalization')
    for name in candidates:
        regular_source(root, name)
    return candidates



def regular_source(root, name):
    """Check every component with lstat; never follow a source symlink/junction."""
    target = root
    parts = PurePosixPath(name).parts
    for index, part in enumerate(parts):
        target = target / part
        try:
            info = target.lstat()
        except FileNotFoundError:
            raise ArchiveBuildError('Missing public source candidate; stage intentional deletions before packing') from None
        if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0):
            raise ArchiveBuildError('Symlinked public source candidate or parent')
        if not (stat.S_ISREG(info.st_mode) if index == len(parts) - 1 else stat.S_ISDIR(info.st_mode)):
            raise ArchiveBuildError('Nonregular public source candidate or parent')
    if info.st_size > MAX_SOURCE_BYTES:
        raise ArchiveBuildError('Public source file exceeds 1 MiB')
    return target


def read_payloads(root, files):
    payloads = {}
    for name in files:
        target = regular_source(root, name)
        with target.open('rb') as stream:
            data = stream.read(MAX_SOURCE_BYTES + 1)
        if len(data) > MAX_SOURCE_BYTES:
            raise ArchiveBuildError('Public source file exceeds 1 MiB')
        payloads[name] = data
    return payloads


def check_payload_boundary(guard, payloads):
    # Validate the captured bytes, not a potentially changed live working tree.
    with tempfile.TemporaryDirectory(prefix='public-source-snapshot-') as temporary:
        snapshot = Path(temporary)
        for name, data in payloads.items():
            target = snapshot / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        errors, _ = guard.scan_sources(snapshot, sorted(payloads))
    if errors:
        raise ArchiveBuildError('\n'.join(f'{name}: {reason}' for name, reason in errors))


def output_destination(root, create=True):
    target = root
    for part in ('production', 'output'):
        target = target / part
        try:
            info = target.lstat()
        except FileNotFoundError:
            if not create:
                raise ArchiveBuildError('Archive output directory changed during packaging') from None
            target.mkdir()
            info = target.lstat()
        if (stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode) or
                getattr(info, 'st_file_attributes', 0) & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0)):
            raise ArchiveBuildError('Archive output parent must be a nonsymlinked directory')
    if not target.resolve().is_relative_to(root.resolve()):
        raise ArchiveBuildError('Archive output escapes the checkout')
    destination = target / 'game_theory_studio_public_source.zip'
    try:
        info = destination.lstat()
    except FileNotFoundError:
        return destination
    if (not stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode) or
            getattr(info, 'st_file_attributes', 0) & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0)):
        raise ArchiveBuildError('Existing archive destination must be a regular nonsymlinked file')
    return destination


def verify_written_archive(path, expected):
    if Path(path).stat().st_size >= MAX_ARCHIVE_BYTES:
        raise ArchiveBuildError('Public archive must be smaller than 15 MiB')
    with zipfile.ZipFile(path) as archive:
        if archive.testzip() is not None:
            raise ArchiveBuildError('Public archive CRC validation failed')
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ArchiveBuildError('Public archive has duplicate members')
        if set(names) != set(expected):
            raise ArchiveBuildError('Public archive has missing or unexpected members')
        if any(archive.read(name) != data for name, data in expected.items()):
            raise ArchiveBuildError('Public archive bytes differ from the verified source snapshot')


def matches_head_snapshot(root, commit, payloads):
    """Compare captured membership and raw Git blob identities, not index stat data."""
    output = subprocess.check_output(['git', '--no-replace-objects', 'ls-tree', '-r', '--full-tree', '-z', commit], cwd=root)
    tree = {}
    for entry in output.split(b'\0'):
        if not entry:
            continue
        metadata, name = entry.split(b'\t', 1)
        mode, kind, identity = metadata.split(b' ', 2)
        if kind != b'blob' or mode not in {b'100644', b'100755'} or name in tree:
            return False
        tree[name] = identity
    if set(tree) != {name.encode('utf-8') for name in payloads}:
        return False
    for name, data in payloads.items():
        # SHA-1 repositories identify a blob by its length-prefixed raw bytes.
        blob = b'blob ' + str(len(data)).encode('ascii') + b'\0' + data
        if hashlib.sha1(blob, usedforsecurity=False).hexdigest().encode('ascii') != tree[name.encode('utf-8')]:
            return False
    return True


def source_provenance(root, payloads):
    """A clean reproducibility claim additionally requires an independent HEAD match."""
    commit = subprocess.run(['git', 'rev-parse', '--verify', 'HEAD'], cwd=root, capture_output=True, text=True)
    status = subprocess.check_output(['git', 'status', '--porcelain=v1', '--untracked-files=all', '-z'], cwd=root)
    dirty = bool(status)
    identity = commit.stdout.strip() if commit.returncode == 0 else None
    if identity is not None and re.fullmatch(r'[0-9a-f]{40}', identity) is None:
        raise ArchiveBuildError('Unsupported Git commit provenance; expected SHA-1')
    if identity is not None and not matches_head_snapshot(root, identity, payloads):
        dirty = True
    return {'commit': identity, 'working_tree_dirty': dirty,
            'reproducible_from_commit': identity is not None and not dirty,
            'scope': 'Git-tracked and nonignored source candidate bytes; ignored private media and font caches excluded'}


def source_versions(payloads):
    read = lambda file: json.loads(payloads[file].decode('utf-8'))
    package = read('package.json')
    schemas = {}
    for file in sorted(payloads):
        if file.startswith(('schemas/', 'production/schema/')) and file.endswith('.schema.json'):
            schema = read(file)
            properties = schema.get('properties', {})
            version = properties.get('schemaVersion', properties.get('schema_version', {})).get('const')
            schemas[file] = {'id': schema.get('$id'), 'dialect': schema.get('$schema'),
                             'data_version': version, 'sha256': hashlib.sha256(payloads[file]).hexdigest()}
    chapters = {file.split('/')[1]: {'schema': read(file)['schemaVersion'], 'content': read(file)['contentVersion']}
                for file in sorted(payloads) if file.startswith('chapters/') and file.endswith('/chapter.json')}
    return {'project': package['version'], 'schemas': schemas, 'chapters': chapters}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--public', action='store_true', required=True,
                        help='Only public source packaging is supported; private artwork is never included.')
    parser.parse_args()
    guard = _source_guard
    try:
        build_source_archive(ROOT, guard)
    except (ValueError, OSError, KeyError, TypeError, zipfile.BadZipFile, RuntimeError) as error:
        message = str(error) if isinstance(error, ArchiveBuildError) else 'Public archive build failed; existing archive preserved'
        raise SystemExit(message) from None


def build_source_archive(root, guard):
    repository = subprocess.run(['git', 'rev-parse', '--show-toplevel'], cwd=root, capture_output=True, text=True)
    if repository.returncode or Path(repository.stdout.strip()).resolve() != root.resolve():
        raise SystemExit('Source packaging requires a Git checkout; exported ZIP supports integrity inspection only. Use git clone for development/repacking.')
    output = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=root)
    files = source_candidates(root, output)
    errors, _ = guard.scan_sources(root, files)
    if errors:
        raise SystemExit('\n'.join(f'{file}: {reason}' for file, reason in errors))
    if any('private_characters' in Path(file).parts for file in files):
        raise SystemExit('Private character paths cannot be packaged.')
    payloads = read_payloads(root, files)
    check_payload_boundary(guard, payloads)
    provenance = source_provenance(root, payloads)
    manifest = {'manifest_schema_version': '1.0',
                'source': provenance, 'versions': source_versions(payloads),
                'distribution': 'public_source_original_svg_only', 'font_binaries_included': False,
                'character_art_included': False,
                'files': [{'path': file, 'bytes': len(payloads[file]),
                           'sha256': hashlib.sha256(payloads[file]).hexdigest()} for file in files]}
    expected = {'game-theory-studio/' + name: data for name, data in payloads.items()}
    expected['game-theory-studio/SOURCE_MANIFEST.json'] = json.dumps(manifest, ensure_ascii=False, indent=2).encode('utf-8')
    destination = output_destination(root)
    handle, temporary = tempfile.mkstemp(suffix='.zip', dir=destination.parent)
    try:
        os.close(handle)
        with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for name, data in expected.items():
                archive.writestr(name, data)
        verify_written_archive(temporary, expected)
        current = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=root)
        if (source_candidates(root, current) != files or source_provenance(root, payloads) != provenance or
                read_payloads(root, files) != payloads):
            raise ArchiveBuildError('Source changed during packaging; existing archive preserved. Retry from a stable checkout.')
        output_destination(root, create=False)
        os.replace(temporary, destination)
    finally:
        Path(temporary).unlink(missing_ok=True)
    print(f'Public archive: {len(files)} source files; {destination.stat().st_size:,} bytes; CRC checked; '
          f'commit={provenance["commit"] or "unborn"}; dirty={provenance["working_tree_dirty"]}.')

if __name__ == '__main__':
    main()
