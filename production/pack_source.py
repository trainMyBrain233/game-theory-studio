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

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--public', action='store_true', required=True,
                        help='Only public source packaging is supported; private artwork is never included.')
    parser.parse_args()
    spec = importlib.util.spec_from_file_location('source_guard', ROOT / 'scripts/qa_source.py')
    guard = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(guard)
    output = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT)
    files = sorted({x.decode('utf-8') for x in output.split(b'\0') if x and (ROOT / x.decode('utf-8')).is_file()})
    errors, _ = guard.scan_sources(ROOT, files)
    if errors:
        raise SystemExit('\n'.join(f'{file}: {reason}' for file, reason in errors))
    if any('private_characters' in Path(file).parts for file in files):
        raise SystemExit('Private character paths cannot be packaged.')
    manifest = {'distribution': 'public_source_original_svg_only', 'font_binaries_included': False,
                'character_art_included': False,
                'files': [{'path': file, 'bytes': (ROOT / file).stat().st_size,
                           'sha256': hashlib.sha256((ROOT / file).read_bytes()).hexdigest()} for file in files]}
    destination = ROOT / 'production/output/game_theory_studio_public_source.zip'
    destination.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(suffix='.zip', dir=destination.parent)
    os.close(handle)
    try:
        with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for file in files:
                archive.write(ROOT / file, 'game-theory-studio/' + file)
            archive.writestr('game-theory-studio/SOURCE_MANIFEST.json', json.dumps(manifest, ensure_ascii=False, indent=2))
        with zipfile.ZipFile(temporary) as archive:
            assert archive.testzip() is None
            assert len(archive.namelist()) == len(set(archive.namelist()))
        assert Path(temporary).stat().st_size < 15 * 1024 * 1024
        os.replace(temporary, destination)
    finally:
        Path(temporary).unlink(missing_ok=True)
    print(f'Public archive: {len(files)} source files; {destination.stat().st_size:,} bytes; CRC checked.')

if __name__ == '__main__':
    main()
