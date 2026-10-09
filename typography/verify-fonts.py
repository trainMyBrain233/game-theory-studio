#!/usr/bin/env python3
"""Read-only registration proof; setup_fonts owns the font acceptance contract."""
from pathlib import Path
import hashlib
import json
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import setup_fonts


def digest(filename):
    with Path(filename).open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def main():
    request = json.load(sys.stdin)
    directory = Path(request['fontDir'])
    expected = request['expected']
    manifest_path = directory / 'prepared_font_manifest.json'
    manifest_bytes = manifest_path.read_bytes()
    if hashlib.sha256(manifest_bytes).hexdigest() != expected['manifestSha256']:
        raise ValueError('Prepared font manifest changed during verification')
    manifest = json.loads(manifest_bytes)
    sources = {}
    for item in expected['fonts']:
        kind, weight = item['kind'], item['weight']
        if kind not in ('Sans', 'Serif') or weight not in ('Regular', 'Bold'):
            raise ValueError('Unsupported SC face')
        filename = f'Noto{kind}CJKSC-{weight}.otf'
        target, previous = directory / filename, manifest[filename]
        if digest(target) != item['sha256']:
            raise ValueError(f'{filename}: font bytes changed during verification')
        # Includes official pins OR independent TTC extraction, SC family,
        # version, real weight, required glyphs and complete-font size checks.
        verified = setup_fonts.verify_cached(target, kind, weight, previous, required_characters=expected.get('inventory', {}).get('characters'))
        if verified['sha256'] != previous.get('sha256'):
            raise ValueError(f'{filename}: manifest does not match independently verified font bytes')
        if verified['source_kind'] == 'local_ttc_extraction':
            sources[str(Path(verified['source']).resolve())] = verified['source_sha256']
        if verified['sha256'] != item['sha256'] or digest(target) != item['sha256']:
            raise ValueError(f'{filename}: font bytes changed during verification')
    for source, sha256 in sources.items():
        if digest(source) != sha256:
            raise ValueError('Original TTC source changed during verification')
    if manifest_path.read_bytes() != manifest_bytes:
        raise ValueError('Prepared font manifest changed during verification')
    print(json.dumps({'expected': expected, 'sources': sources}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        raise SystemExit(f'SC font provenance failed: {error}')
