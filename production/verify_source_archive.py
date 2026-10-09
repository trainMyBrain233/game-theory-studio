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
    """Reject symlinks (including parent directories) before reading any bytes."""
    target = root
    for part in relative.parts:
        target = target / part
        require(not target.is_symlink(), 'Missing or symlinked archive source')
    require(target.resolve().is_relative_to(root), 'Archive source escapes its root')
    require(target.is_file(), 'Missing or symlinked archive source')
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


def verify_archive(root):
    root = Path(root).resolve()
    manifest_file = regular_source(root, Path('SOURCE_MANIFEST.json'))
    manifest = json.loads(manifest_file.read_text(encoding='utf-8'))
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
        data = target.read_bytes()
        require(len(data) == entry['bytes'] and hashlib.sha256(data).hexdigest() == entry['sha256'],
                'Archive source differs')
    require(archive_inventory(root) == expected | {'SOURCE_MANIFEST.json'},
            'Archive contains missing or unlisted files')
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
