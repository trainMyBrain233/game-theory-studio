"""Real FontTools/TTC regressions for cmap entries that do not cover a glyph.

The generated faces are synthetic test data, not redistributed Noto fonts. Their
20,000 tiny glyphs satisfy the existing completeness gate so production QA can
exercise the real TTC extraction/checksum path without bypassing provenance.
"""
from contextlib import redirect_stdout
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTCollection, TTFont

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import qa_glyphs
import setup_fonts

spec = importlib.util.spec_from_file_location('notdef_check_fonts', ROOT / 'production/qa/check_fonts.py')
check_fonts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check_fonts)
TARGET = '龘'
CURRENT = ''.join(setup_fonts.current_characters())
TEXT = TARGET + '博弈论入门参与者信息策略收益每种组合各得什么选择规则红蓝小A小B'


def make_face(kind, weight, *, notdef=False):
    builder = FontBuilder(1000, isTTF=True)
    # A nonzero .notdef slot survives FontTools's cmap decoder. Entries mapping
    # to ID0 are dropped on decoding and are tested separately in memory below.
    order = (['zero', '.notdef', 'ink'] if notdef else ['.notdef', 'zero', 'ink'])
    order += [f'empty{i}' for i in range(20000 - len(order))]
    builder.setupGlyphOrder(order)
    cmap = {ord(c): 'ink' for c in TEXT + CURRENT}
    if notdef:
        cmap[ord(TARGET)] = '.notdef'
    builder.setupCharacterMap(cmap)
    pen = TTGlyphPen(None)
    empty = pen.glyph()
    pen = TTGlyphPen(None)
    pen.moveTo((50, 0)); pen.lineTo((450, 0)); pen.lineTo((450, 600)); pen.closePath()
    glyphs = dict.fromkeys(order, empty)
    glyphs['ink'] = pen.glyph()
    builder.setupGlyf(glyphs)
    builder.setupHorizontalMetrics(dict.fromkeys(order, (500, 0)))
    builder.setupHorizontalHeader(ascent=800, descent=-200)
    builder.setupNameTable({'familyName': f'Noto {kind} CJK SC', 'styleName': weight,
                           'version': f'Version {setup_fonts.EXPECTED_VERSIONS[kind]}; synthetic QA fixture'})
    builder.setupOS2(usWeightClass=400 if weight == 'Regular' else 700)
    builder.setupPost()
    builder.setupMaxp()
    builder.font['head'].created = builder.font['head'].modified = 3400000000
    builder.font.recalcTimestamp = False
    return builder.font


def fixture(root, *, notdef=False):
    font_dir = root / 'typography/fonts'
    font_dir.mkdir(parents=True)
    (root / 'typography/qa').mkdir()
    (root / 'production/qa').mkdir(parents=True)
    (root / 'typography/qa/text-runs.json').write_text(json.dumps({'textRuns': [TEXT]}), encoding='utf-8')
    (root / 'production/qa/checks.json').write_text(json.dumps({'text_inventory': [TEXT]}), encoding='utf-8')
    manifest = {}
    for kind in ['Sans', 'Serif']:
        for weight in ['Regular', 'Bold']:
            collection = TTCollection()
            collection.fonts = [make_face(kind, weight, notdef=notdef and (kind, weight) == ('Serif', 'Bold'))]
            source = font_dir / f'fixture-{kind}-{weight}.ttc'
            collection.save(source)
            collection.close()
            target = font_dir / f'Noto{kind}CJKSC-{weight}.otf'
            manifest[target.name] = setup_fonts.prepare(source, target, kind, weight)
    (font_dir / 'prepared_font_manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
    return font_dir


def old_membership_checker(module):
    """Re-run the pre-fix acceptance logic against exactly the same real bytes."""
    source = Path(module.__file__).read_text(encoding='utf-8')
    guard = "if name != '.notdef' and font.getGlyphID(name) != 0"
    if source.count(guard) != 1:
        raise RuntimeError('Expected exactly one coverage guard for the old-logic control')
    old = types.ModuleType('old_membership_control')
    old.__file__ = module.__file__
    exec(compile(source.replace(guard, 'if True'), module.__file__, 'exec'), old.__dict__)
    return old


class RealGlyphCoverageTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(redirect_stdout(io.StringIO()))

    def check_both(self, root, *, missing=False):
        for module, directory, report in [
            (qa_glyphs, root, root / 'typography/qa/glyphs.json'),
            (check_fonts, root / 'production', root / 'production/qa/font_checks.json'),
        ]:
            with self.subTest(checker=module.__file__):
                report.unlink(missing_ok=True)
                if missing:
                    with self.assertRaisesRegex(ValueError, f'missing characters.*{TARGET}'):
                        module.main(directory)
                    self.assertFalse(report.exists(), 'A failed face must not produce a success report')
                else:
                    module.main(directory)
                    entries = json.loads(report.read_text(encoding='utf-8'))
                    self.assertEqual(len(entries), 4)
                    self.assertTrue(all(entry['missing'] == [] for entry in entries))

    def test_real_ttc_notdef_was_accepted_by_old_logic_and_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fonts = fixture(root, notdef=True)
            target = fonts / 'NotoSerifCJKSC-Bold.otf'
            with TTFont(target) as font:
                self.assertIn(ord(TARGET), font.getBestCmap())
                self.assertEqual(font.getBestCmap()[ord(TARGET)], '.notdef')
                self.assertNotEqual(font.getGlyphID('.notdef'), 0)
            for module, base in [(qa_glyphs, root), (check_fonts, root / 'production')]:
                old_membership_checker(module).main(base)
            self.check_both(root, missing=True)

    def test_valid_real_ttc_faces_pass_both_checkers(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixture(root)
            self.check_both(root)

    def test_real_in_memory_id_zero_alias_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixture(root)
            def open_with_zero_alias(path):
                font = TTFont(path)
                if path.name == 'NotoSerifCJKSC-Bold.otf':
                    order = font.getGlyphOrder()
                    order[0] = 'missingAlias'
                    font.setGlyphOrder(order)
                    font.getBestCmap()[ord(TARGET)] = 'missingAlias'
                    self.assertEqual(font.getGlyphID('missingAlias'), 0)
                return font
            # Real tables and glyph-ID lookup, only the loading boundary is
            # wrapped because serialized ID0 mappings are stripped by FontTools.
            with patch.object(qa_glyphs, 'TTFont', open_with_zero_alias), \
                 patch.object(check_fonts, 'TTFont', open_with_zero_alias):
                self.check_both(root, missing=True)


class OptimizationModes(unittest.TestCase):
    def test_real_font_regressions_survive_optimization(self):
        for flags in [[], ['-O'], ['-OO']]:
            with self.subTest(flags=flags):
                env = os.environ.copy()
                env.pop('PYTHONOPTIMIZE', None)
                result = subprocess.run([sys.executable, *flags, str(Path(__file__).resolve()),
                                         'RealGlyphCoverageTests'], env=env,
                                        capture_output=True, text=True, timeout=120)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn('Ran 3 tests', result.stderr)


if __name__ == '__main__':
    unittest.main()
