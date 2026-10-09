#!/usr/bin/env python3
"""Check the actual chapter and template text against all four complete SC faces."""
from pathlib import Path
from fontTools.ttLib import TTFont
import hashlib
import json

ROOT = Path(__file__).resolve().parent.parent


def main(root=ROOT):
    font_dir = root / 'typography/fonts'
    manifest = json.loads((font_dir / 'prepared_font_manifest.json').read_text(encoding='utf-8'))
    runs = json.loads((root / 'typography/qa/text-runs.json').read_text(encoding='utf-8'))['textRuns']
    chars = {c for c in ''.join(runs) if not c.isspace()}
    results = []
    for kind in ['Sans', 'Serif']:
        for weight, number in [('Regular', 400), ('Bold', 700)]:
            filename = f'Noto{kind}CJKSC-{weight}.otf'
            source = font_dir / filename
            with TTFont(source) as font:
                family = font['name'].getDebugName(1)
                if family != f'Noto {kind} CJK SC':
                    raise ValueError(f'{filename}: unexpected family {family!r}')
                if font['OS/2'].usWeightClass != number:
                    raise ValueError(f'{filename}: expected weight {number}')
                if len(font.getGlyphOrder()) < 20000:
                    raise ValueError(f'{filename}: expected a complete SC face, not a subset')
                checksum = hashlib.sha256(source.read_bytes()).hexdigest()
                if checksum != manifest[filename]['sha256']:
                    raise ValueError(f'{filename}: SHA256 mismatch')
                missing = sorted(c for c in chars if ord(c) not in font.getBestCmap())
                if missing:
                    raise ValueError(f'{filename}: missing characters {missing!r}')
                results.append({'font': filename, 'family': family, 'weight': number,
                                'unique_characters_checked': len(chars), 'missing': missing,
                                'sha256_matches_local_manifest': True})
    (root / 'typography/qa/glyphs.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Glyph QA: all {len(chars)} unique chapter/template characters covered by four full SC fonts.')


if __name__ == '__main__':
    main()
