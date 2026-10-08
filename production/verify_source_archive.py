#!/usr/bin/env python3
"""Verify an extracted public source archive without Git, dependencies or fonts."""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import sys

def verify_archive(root):
    root = Path(root).resolve()
    manifest = json.loads((root / 'SOURCE_MANIFEST.json').read_text(encoding='utf-8'))
    assert manifest['manifest_schema_version'] == '1.0'
    assert manifest['distribution'] == 'public_source_original_svg_only'
    assert manifest['font_binaries_included'] is False and manifest['character_art_included'] is False
    source = manifest['source']
    assert isinstance(source['working_tree_dirty'], bool)
    assert source['reproducible_from_commit'] == (source['commit'] is not None and not source['working_tree_dirty'])
    expected = set()
    for entry in manifest['files']:
        relative = Path(entry['path'])
        assert not relative.is_absolute() and '..' not in relative.parts and relative.as_posix() == entry['path'], 'Unsafe manifest path'
        assert entry['path'] not in expected and entry['path'] != 'SOURCE_MANIFEST.json', 'Duplicate/reserved manifest path'
        expected.add(entry['path'])
        target = root / relative
        assert target.is_file() and not target.is_symlink(), f'Missing or symlinked archive source: {relative}'
        data = target.read_bytes()
        assert len(data) == entry['bytes'] and hashlib.sha256(data).hexdigest() == entry['sha256'], f'Archive source differs: {relative}'
    actual = {file.relative_to(root).as_posix() for file in root.rglob('*') if file.is_file() or file.is_symlink()}
    assert actual == expected | {'SOURCE_MANIFEST.json'}, 'Archive contains missing or unlisted files'
    # Use this verifier's own guard, never execute code from a caller-supplied directory.
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
    assert not errors, 'Archive fails public-source boundary checks'
    return manifest

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', nargs='?', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    result = verify_archive(args.directory)
    print(f'Archive integrity verified: {len(result["files"])} source files; '
          f'commit={result["source"]["commit"] or "unborn"}; dirty={result["source"]["working_tree_dirty"]}. '
          'This verifies source bytes only; use git clone for development and npm test.')
