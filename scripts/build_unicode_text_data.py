"""Regenerate/check the shared Unicode 15 text contract (no downloads needed).

Generation alone requires CPython's Unicode 15.0.0 database (Python 3.12).
Consumers read the checked-in ranges and do not depend on their runtime UCD.
Unicode-derived ranges retain the notice in docs/licenses/Unicode-15.0.0.txt.
"""
import argparse
import json
from pathlib import Path
import unicodedata as ucd

VERSION = '15.0.0'
# Unicode 15 DerivedCoreProperties.txt, Default_Ignorable_Code_Point (merged ranges).
IGNORABLE = [
    [0xAD, 0xAD], [0x34F, 0x34F], [0x61C, 0x61C], [0x115F, 0x1160],
    [0x17B4, 0x17B5], [0x180B, 0x180F], [0x200B, 0x200F], [0x202A, 0x202E],
    [0x2060, 0x206F], [0x3164, 0x3164], [0xFE00, 0xFE0F], [0xFEFF, 0xFEFF],
    [0xFFA0, 0xFFA0], [0xFFF0, 0xFFF8], [0x1BCA0, 0x1BCA3],
    [0x1D173, 0x1D17A], [0xE0000, 0xE0FFF],
]


def ranges(points):
    result = []
    for point in points:
        if result and result[-1][1] == point - 1:
            result[-1][1] = point
        else:
            result.append([point, point])
    return result


def build():
    if ucd.unidata_version != VERSION:
        raise RuntimeError(f'Generation requires Unicode {VERSION}, got {ucd.unidata_version}; consumers do not need this version')
    categories = [ucd.category(chr(point)) for point in range(0x110000)]
    return {
        'unicodeVersion': VERSION,
        'sources': ['https://www.unicode.org/Public/15.0.0/ucd/UnicodeData.txt',
                    'https://www.unicode.org/Public/15.0.0/ucd/DerivedCoreProperties.txt',
                    'https://www.unicode.org/reports/tr15/'],
        'generator': 'scripts/build_unicode_text_data.py; CPython unicodedata 15.0.0',
        'license': 'Unicode-DFS-2016',
        'licenseFile': 'docs/licenses/Unicode-15.0.0.txt',
        'licenseSource': 'https://raw.githubusercontent.com/unicode-org/icu/release-72-1/icu4c/LICENSE',
        'readable': ranges(point for point, category in enumerate(categories) if category[0] in 'LN'),
        'unsupported': ranges(point for point, category in enumerate(categories) if category in ('Cn', 'Cs', 'Co')),
        'singleLineForbidden': ranges(point for point, category in enumerate(categories) if category[0] == 'C' or category in ('Zl', 'Zp')),
        'spaces': ranges(point for point, category in enumerate(categories) if category == 'Zs'),
        'defaultIgnorable': IGNORABLE,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    target = Path(__file__).with_name('unicode-text-15.0.0.json')
    encoded = json.dumps(build(), ensure_ascii=False, separators=(',', ':')) + '\n'
    if args.check:
        if target.read_text(encoding='utf-8') != encoded:
            raise SystemExit('Unicode text table is stale; regenerate and review it')
        print('Unicode 15.0.0 text table reproduces byte-for-byte')
    else:
        target.write_text(encoded, encoding='utf-8')
