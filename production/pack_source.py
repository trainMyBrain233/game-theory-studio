#!/usr/bin/env python3
"""Archive the unified public source candidate list after the same source guard as CI."""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import os
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]

def source_provenance(root):
    """Do not equate a Git HEAD with uncommitted source candidate bytes."""
    commit = subprocess.run(['git', 'rev-parse', '--verify', 'HEAD'], cwd=root, capture_output=True, text=True)
    status = subprocess.check_output(['git', 'status', '--porcelain=v1', '--untracked-files=all', '-z'], cwd=root)
    dirty = bool(status)
    return {'commit': commit.stdout.strip() if commit.returncode == 0 else None,
            'working_tree_dirty': dirty,
            'reproducible_from_commit': commit.returncode == 0 and not dirty,
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
    spec = importlib.util.spec_from_file_location('source_guard', ROOT / 'scripts/qa_source.py')
    guard = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(guard)
    repository = subprocess.run(['git', 'rev-parse', '--show-toplevel'], cwd=ROOT, capture_output=True, text=True)
    if repository.returncode or Path(repository.stdout.strip()).resolve() != ROOT.resolve():
        raise SystemExit('Source packaging requires a Git checkout; exported ZIP supports integrity inspection only. Use git clone for development/repacking.')
    output = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT)
    files = sorted({x.decode('utf-8') for x in output.split(b'\0') if x and (ROOT / x.decode('utf-8')).is_file()})
    errors, _ = guard.scan_sources(ROOT, files)
    if errors:
        raise SystemExit('\n'.join(f'{file}: {reason}' for file, reason in errors))
    if any('private_characters' in Path(file).parts for file in files):
        raise SystemExit('Private character paths cannot be packaged.')
    provenance = source_provenance(ROOT)
    payloads = {file: (ROOT / file).read_bytes() for file in files}
    manifest = {'manifest_schema_version': '1.0',
                'source': provenance, 'versions': source_versions(payloads),
                'distribution': 'public_source_original_svg_only', 'font_binaries_included': False,
                'character_art_included': False,
                'files': [{'path': file, 'bytes': len(payloads[file]),
                           'sha256': hashlib.sha256(payloads[file]).hexdigest()} for file in files]}
    destination = ROOT / 'production/output/game_theory_studio_public_source.zip'
    destination.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(suffix='.zip', dir=destination.parent)
    os.close(handle)
    try:
        with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for file in files:
                archive.writestr('game-theory-studio/' + file, payloads[file])
            archive.writestr('game-theory-studio/SOURCE_MANIFEST.json', json.dumps(manifest, ensure_ascii=False, indent=2))
        with zipfile.ZipFile(temporary) as archive:
            assert archive.testzip() is None
            assert len(archive.namelist()) == len(set(archive.namelist()))
        if source_provenance(ROOT) != provenance or any((ROOT / file).read_bytes() != data for file, data in payloads.items()):
            raise SystemExit('Source changed during packaging; existing archive preserved. Retry from a stable checkout.')
        assert Path(temporary).stat().st_size < 15 * 1024 * 1024
        os.replace(temporary, destination)
    finally:
        Path(temporary).unlink(missing_ok=True)
    print(f'Public archive: {len(files)} source files; {destination.stat().st_size:,} bytes; CRC checked; '
          f'commit={provenance["commit"] or "unborn"}; dirty={provenance["working_tree_dirty"]}.')

if __name__ == '__main__':
    main()
