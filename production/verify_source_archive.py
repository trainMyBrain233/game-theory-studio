#!/usr/bin/env python3
"""Verify an extracted public source archive without Git, dependencies or fonts."""
from pathlib import Path, PurePosixPath, PureWindowsPath
import argparse
import hashlib
import importlib.util
import json
import os
import re
import stat
import sys
import unicodedata


class ArchiveValidationError(ValueError):
    """The archive does not satisfy its manifest or the public-source boundary."""


def require(condition, message):
    # Never use assert for untrusted input: -O and PYTHONOPTIMIZE remove it.
    if not condition:
        raise ArchiveValidationError(message)


# Win32 resolves these names as devices even when an extension is appended.
WINDOWS_RESERVED_NAMES = {'CON', 'PRN', 'AUX', 'NUL', 'CONIN$', 'CONOUT$'} | {
    prefix + suffix for prefix in ('COM', 'LPT') for suffix in '123456789¹²³'
}
# Match the public-source guard without importing source code before verification.
MAX_SOURCE_BYTES = 1024 * 1024
HASH_CHUNK_BYTES = 64 * 1024
# Independent pre-import copy of QA's credential patterns: path validation must
# reject credential-shaped names before reading files or loading the guard.
CREDENTIAL_PATTERNS = (
    re.compile(r'-----BEGIN (?:[A-Z ]+)?PRIVATE' + r' KEY-----'),
    re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b'),
    re.compile(r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'),
    re.compile(r'\bxox[baprs]-[A-Za-z0-9-]{20,}\b'),
    re.compile(r'\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{30,}\b'),
)
# Metadata has its own explicit uncompressed ceiling; never trust its file list
# to supply a read bound. This matches the producer's public ZIP size budget.
MAX_MANIFEST_BYTES = 15 * 1024 * 1024


def portable_path_collision(name, seen):
    """Reject NFC/case-folded member and directory aliases, including file/dir clashes."""
    parts = name.split('/')
    portable_parts = [unicodedata.normalize('NFC', unicodedata.normalize('NFC', part).casefold())
                      for part in parts]
    for count in range(1, len(parts) + 1):
        prefix = '/'.join(parts[:count])
        identity = (prefix, count == len(parts))
        key = '/'.join(portable_parts[:count])
        if key in seen and seen[key] != identity:
            return True
        seen[key] = identity
    return False


def validate_source_path(name):
    """Match pack_source's pre-extraction filename contract without importing it."""
    require(isinstance(name, str) and bool(name), 'Unsafe manifest path')
    require(not any(pattern.search(name) for pattern in CREDENTIAL_PATTERNS),
            'Credential-like manifest path')
    relative = PurePosixPath(name)
    require(not relative.is_absolute() and not PureWindowsPath(name).drive and
            not any(character in '<>:"\\|?*' for character in name) and
            all(part not in {'', '.', '..'} and not part.endswith((' ', '.')) for part in name.split('/')) and
            not any(ord(character) < 32 for character in name) and relative.as_posix() == name and
            not any(part.partition('.')[0].rstrip(' ').upper() in WINDOWS_RESERVED_NAMES for part in name.split('/')),
            'Unsafe manifest path')
    require(name.split('/')[0].casefold() != 'source_manifest.json', 'Reserved manifest path')
    return relative


def regular_source(root, relative):
    """Reject missing/nonregular components and symlinks before any source read."""
    target = root
    for index, part in enumerate(relative.parts):
        target = target / part
        try:
            info = target.lstat()
        except FileNotFoundError:
            raise ArchiveValidationError('Missing archive source') from None
        require(not stat.S_ISLNK(info.st_mode) and
                not getattr(info, 'st_file_attributes', 0) & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0),
                'Symlinked archive source or parent')
        require(stat.S_ISREG(info.st_mode) if index == len(relative.parts) - 1 else stat.S_ISDIR(info.st_mode),
                'Nonregular archive source or parent')
    return target


def archive_inventory(root):
    actual = set()
    def fail_walk(error):
        raise error
    for directory, subdirectories, filenames in os.walk(root, followlinks=False, onerror=fail_walk):
        for name in subdirectories + filenames:
            target = Path(directory) / name
            mode = target.lstat().st_mode
            require(not stat.S_ISLNK(mode), 'Archive contains a symlink')
            require(stat.S_ISDIR(mode) or stat.S_ISREG(mode), 'Archive contains nonregular source')
            if stat.S_ISREG(mode):
                actual.add(target.relative_to(root).as_posix())
    return actual


def verify_source_bytes(target, expected_size, expected_sha256, *, capture=False):
    """Reject oversized sources before opening; bound reads even if a file grows."""
    size = target.stat().st_size
    require(size <= MAX_SOURCE_BYTES and expected_size <= MAX_SOURCE_BYTES,
            'Archive source exceeds 1 MiB')
    require(size == expected_size, 'Archive source differs')
    digest = hashlib.sha256()
    consumed = 0
    chunks = [] if capture else None
    with target.open('rb') as stream:
        while True:
            # One extra byte distinguishes exact length from growth after stat.
            data = stream.read(min(HASH_CHUNK_BYTES, expected_size - consumed + 1))
            if not data:
                break
            consumed += len(data)
            require(consumed <= expected_size, 'Archive source differs')
            digest.update(data)
            if capture:
                chunks.append(data)
    require(consumed == expected_size and digest.hexdigest() == expected_sha256,
            'Archive source differs')
    return b''.join(chunks) if capture else None


def version_source(name):
    if name == 'package.json':
        return 'project', None
    if name.startswith(('schemas/', 'production/schema/')) and name.endswith('.schema.json'):
        return 'schemas', name
    if name.startswith('chapters/') and name.endswith('/chapter.json'):
        return 'chapters', name.split('/')[1]
    return None


def source_version(name, data):
    """Derive one metadata entry from verified bytes, without executing code."""
    try:
        document = json.loads(data.decode('utf-8'))
        section, _ = version_source(name)
        if section == 'project':
            return document['version']
        if section == 'schemas':
            properties = document.get('properties', {})
            version = properties.get('schemaVersion', properties.get('schema_version', {})).get('const')
            return {'id': document.get('$id'), 'dialect': document.get('$schema'),
                    'data_version': version, 'sha256': hashlib.sha256(data).hexdigest()}
        return {'schema': document['schemaVersion'], 'content': document['contentVersion']}
    except (KeyError, TypeError, AttributeError, ValueError, UnicodeError):
        raise ArchiveValidationError('Invalid archive version source') from None


def source_versions(payloads):
    """Independent producer contract, used by contract tests, not archive reads."""
    require('package.json' in payloads, 'Invalid archive version source')
    result = {'schemas': {}, 'chapters': {}}
    for name in sorted(payloads):
        identity = version_source(name)
        if identity is None:
            continue
        section, key = identity
        value = source_version(name, payloads[name])
        if section == 'project':
            result[section] = value
        else:
            result[section][key] = value
    return result


class VersionChecks:
    """Compare one source at a time; never retain source bytes or parsed values.

    The manifest is already capped at 15 MiB. Additional retained state consists
    only of names and booleans bounded by its file list, not total payload size.
    """
    def __init__(self, versions):
        self.versions = versions if isinstance(versions, dict) else {}
        self.valid = (self.versions.keys() == {'project', 'schemas', 'chapters'} and
                      isinstance(self.versions.get('schemas'), dict) and
                      isinstance(self.versions.get('chapters'), dict))
        self.project_seen = False
        self.schemas = set()
        self.chapters = {}

    def consume(self, name, data):
        section, key = version_source(name)
        value = source_version(name, data)
        if section == 'project':
            self.project_seen = True
            self.valid = self.valid and same_json(self.versions.get('project'), value)
        elif section == 'schemas':
            self.schemas.add(key)
            self.valid = self.valid and same_json(self.versions['schemas'].get(key), value)
        else:
            # Producer uses sorted source names and keeps the last chapter key.
            previous = self.chapters.get(key)
            if previous is None or name > previous[0]:
                expected = self.versions.get('chapters')
                matches = isinstance(expected, dict) and same_json(expected.get(key), value)
                self.chapters[key] = (name, matches)

    def finish(self):
        require(self.valid and self.project_seen and
                self.schemas == self.versions['schemas'].keys() and
                self.chapters.keys() == self.versions['chapters'].keys() and
                all(matches for _, matches in self.chapters.values()),
                'Archive versions differ from source')


def same_json(left, right):
    """Compare JSON with exact types as well as keys (true must not equal 1)."""
    if type(left) is not type(right):
        return False
    if isinstance(left, dict):
        return left.keys() == right.keys() and all(same_json(left[key], right[key]) for key in left)
    if isinstance(left, list):
        return len(left) == len(right) and all(same_json(a, b) for a, b in zip(left, right))
    return left == right


def verify_archive(root):
    root = Path(root).resolve()
    manifest_file = regular_source(root, Path('SOURCE_MANIFEST.json'))
    require(manifest_file.stat().st_size <= MAX_MANIFEST_BYTES,
            'Archive manifest exceeds 15 MiB')
    with manifest_file.open('rb') as stream:
        manifest_data = stream.read(MAX_MANIFEST_BYTES + 1)
    require(len(manifest_data) <= MAX_MANIFEST_BYTES, 'Archive manifest exceeds 15 MiB')
    manifest = json.loads(manifest_data.decode('utf-8'))
    require(isinstance(manifest, dict), 'Invalid archive manifest')
    require(manifest.get('manifest_schema_version') == '1.0', 'Unsupported manifest schema')
    require(manifest.get('distribution') == 'public_source_original_svg_only', 'Invalid archive distribution')
    require(manifest.get('font_binaries_included') is False and manifest.get('character_art_included') is False,
            'Invalid archive content boundary')
    source = manifest.get('source')
    require(isinstance(source, dict), 'Invalid archive source provenance')
    require('commit' in source and (source['commit'] is None or
            isinstance(source['commit'], str) and re.fullmatch(r'[0-9a-f]{40}', source['commit']) is not None),
            'Invalid archive commit provenance')
    require(isinstance(source.get('working_tree_dirty'), bool), 'Invalid archive dirty provenance')
    require(isinstance(source.get('reproducible_from_commit'), bool) and
            source['reproducible_from_commit'] == (source['commit'] is not None and not source['working_tree_dirty']),
            'Invalid archive reproducibility provenance')
    require(isinstance(manifest.get('files'), list), 'Invalid manifest file list')
    expected = set()
    portable_paths = {}
    versions = VersionChecks(manifest.get('versions'))
    for entry in manifest['files']:
        require(isinstance(entry, dict), 'Invalid manifest file entry')
        name = entry.get('path')
        relative = validate_source_path(name)
        require(name not in expected, 'Duplicate manifest path')
        require(not portable_path_collision(name, portable_paths),
                'Archive paths collide after portable normalization')
        require(type(entry.get('bytes')) is int and entry['bytes'] >= 0 and
                isinstance(entry.get('sha256'), str) and re.fullmatch(r'[0-9a-f]{64}', entry['sha256']) is not None,
                'Invalid manifest file checksum')
        expected.add(name)
        target = regular_source(root, relative)
        capture = version_source(name) is not None
        data = verify_source_bytes(target, entry['bytes'], entry['sha256'], capture=capture)
        if capture:
            versions.consume(name, data)
        # Drop this source reference before opening the next file.
        del data
    require(archive_inventory(root) == expected | {'SOURCE_MANIFEST.json'},
            'Archive contains missing or unlisted files')
    versions.finish()
    # Use this verifier's own guard, never execute code from a caller-supplied directory.
    # All manifest, inventory and byte checks finish before importing source code.
    guard_file = Path(__file__).resolve().parents[1] / 'scripts/qa_source.py'
    spec = importlib.util.spec_from_file_location('archive_source_guard', guard_file)
    guard = importlib.util.module_from_spec(spec)
    previous = sys.dont_write_bytecode
    try:
        sys.dont_write_bytecode = True
        spec.loader.exec_module(guard)
    finally:
        sys.dont_write_bytecode = previous
    errors, _ = guard.scan_sources(root, sorted(expected))
    require(not errors, 'Archive fails public-source boundary checks')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', nargs='?', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    try:
        result = verify_archive(args.directory)
    except (ArchiveValidationError, OSError, UnicodeError, json.JSONDecodeError) as error:
        # Do not echo source text, credentials, or untrusted manifest values.
        message = str(error) if isinstance(error, ArchiveValidationError) else 'Archive metadata or source is unreadable'
        parser.exit(1, f'Archive verification failed: {message}\n')
    print(f'Archive integrity verified: {len(result["files"])} source files; '
          f'commit={result["source"]["commit"] or "unborn"}; dirty={result["source"]["working_tree_dirty"]}. '
          'This verifies source bytes only; use git clone for development and npm test.')
