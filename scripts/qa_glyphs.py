#!/usr/bin/env python3
"""Check the actual chapter and template text against all four complete SC faces."""
from pathlib import Path
from fontTools.ttLib import TTFont
import hashlib
import json

ROOT = Path(__file__).resolve().parent.parent
font_dir = ROOT / 'typography/fonts'
manifest = json.loads((font_dir / 'prepared_font_manifest.json').read_text())
runs = json.loads((ROOT / 'typography/qa/text-runs.json').read_text())['textRuns']
chars = {c for c in ''.join(runs) if not c.isspace()}
results = []
for kind in ['Sans', 'Serif']:
    for weight, number in [('Regular', 400), ('Bold', 700)]:
        filename = f'Noto{kind}CJKSC-{weight}.otf'
        source = font_dir / filename
        font = TTFont(source)
        family = font['name'].getDebugName(1)
        assert family == f'Noto {kind} CJK SC', (filename, family)
        assert font['OS/2'].usWeightClass == number
        assert len(font.getGlyphOrder()) >= 20000
        checksum = hashlib.sha256(source.read_bytes()).hexdigest()
        assert checksum == manifest[filename]['sha256']
        missing = sorted(c for c in chars if ord(c) not in font.getBestCmap())
        assert not missing, (filename, missing)
        results.append({'font': filename, 'family': family, 'weight': number,
                        'unique_characters_checked': len(chars), 'missing': missing,
                        'sha256_matches_local_manifest': True})
        font.close()
(ROOT / 'typography/qa/glyphs.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
print(f'Glyph QA: all {len(chars)} unique chapter/template characters covered by four full SC fonts.')
