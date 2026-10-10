#!/usr/bin/env python3
"""Check production text against verified full SC font faces."""
from pathlib import Path
from fontTools.ttLib import TTFont
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / 'scripts'))
from setup_fonts import verify_cached


def main(root=ROOT):
    qa = json.loads((root / 'qa/checks.json').read_text(encoding='utf-8'))
    text = ''.join(qa.get('text_inventory', [])) + '博弈论入门参与者信息策略收益每种组合各得什么红蓝小A小B'
    font_dir = root.parent / 'typography/fonts'
    manifest = json.loads((font_dir / 'prepared_font_manifest.json').read_text(encoding='utf-8'))
    chars = {ord(x) for x in text if not x.isspace()}
    out = []
    for kind, weight, value in [('Sans', 'Regular', 400), ('Sans', 'Bold', 700),
                                ('Serif', 'Regular', 400), ('Serif', 'Bold', 700)]:
        path = font_dir / f'Noto{kind}CJKSC-{weight}.otf'
        with TTFont(path) as font:
            names = {n.toUnicode() for n in font['name'].names if n.nameID in [1, 16]}
            if f'Noto {kind} CJK SC' not in names:
                raise ValueError(f'{path.name}: unexpected family {sorted(names)!r}')
            if font['OS/2'].usWeightClass != value:
                raise ValueError(f'{path.name}: expected weight {value}')
            verify_cached(path, kind, weight, manifest.get(path.name, {}))
            checksum = hashlib.sha256(path.read_bytes()).hexdigest()
            if checksum != manifest[path.name]['sha256']:
                raise ValueError(f'{path.name}: SHA256 mismatch')
            # A mapped code point is not covered when it resolves to the missing glyph.
            covered = {point for point, name in (font.getBestCmap() or {}).items()
                       if name != '.notdef' and font.getGlyphID(name) != 0}
            missing = sorted(chr(c) for c in chars if c not in covered)
            if missing:
                raise ValueError(f'{path.name}: missing characters {missing!r}')
            out.append({'file': path.name, 'family': sorted(names), 'weight': value,
                        'cmap_covered_characters': len(chars), 'missing': missing, 'sha256': checksum})
    (root / 'qa/font_checks.json').write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
