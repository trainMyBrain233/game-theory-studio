#!/usr/bin/env python3
"""Read-only provenance and Unicode cmap proof for the two public animatic faces."""
from pathlib import Path
import hashlib
import json
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts'))
import setup_fonts
from fontTools.ttLib import TTFont


def digest(filename):
    hasher = hashlib.sha256()
    with filename.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            hasher.update(chunk)
    return hasher.hexdigest()


def cmap_ranges(font):
    # A cmap entry pointing to .notdef is still a missing glyph.
    points = sorted(point for point, name in font.getBestCmap().items()
                    if name != '.notdef' and font.getGlyphID(name) != 0)
    ranges = []
    for point in points:
        if ranges and point == ranges[-1][1] + 1:
            ranges[-1][1] = point
        else:
            ranges.append([point, point])
    return ranges


def main():
    request = json.load(sys.stdin)
    directory = Path(request['fontDir'])
    expected = request['expected']
    manifest_path = directory / 'prepared_font_manifest.json'
    manifest_bytes = manifest_path.read_bytes()
    manifest_hash = hashlib.sha256(manifest_bytes).hexdigest()
    if manifest_hash != expected['manifestSha256']:
        raise ValueError('Prepared font manifest changed during verification')
    manifest = json.loads(manifest_bytes)
    fonts = []
    for item in expected['fonts']:
        weight = item['weight']
        filename = f'NotoSansCJKSC-{weight}.otf'
        target = directory / filename
        previous = manifest[filename]
        if digest(target) != item['sha256']:
            raise ValueError(f'{filename}: font bytes changed during verification')
        # Reuse setup:fonts --verify-only's trust contract. Metadata and a
        # self-authored manifest hash alone do not establish acceptable bytes.
        verified = setup_fonts.verify_cached(target, 'Sans', weight, previous)
        if verified['sha256'] != previous.get('sha256'):
            raise ValueError(f'{filename}: manifest does not match independently verified font bytes')
        if verified['sha256'] != item['sha256']:
            raise ValueError(f'{filename}: font bytes changed during verification')
        with TTFont(target, lazy=True) as font:
            ranges = cmap_ranges(font)
        result = {'weight': weight, 'sha256': verified['sha256'], 'cmapRanges': ranges}
        if (previous.get('source_kind') == 'local_ttc_extraction'
                and verified['sha256'] != setup_fonts.OFFICIAL_SHA256[('Sans', weight)]):
            source_hash = digest(Path(previous['source']))
            if source_hash != item.get('sourceSha256'):
                raise ValueError(f'{filename}: original TTC changed during verification')
            result['sourceSha256'] = source_hash
        if digest(target) != item['sha256']:
            raise ValueError(f'{filename}: font bytes changed during verification')
        fonts.append(result)
    if digest(manifest_path) != manifest_hash:
        raise ValueError('Prepared font manifest changed during verification')
    print(json.dumps({'manifestSha256': manifest_hash, 'fonts': fonts}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        raise SystemExit(f'Font verification failed: {error}')
