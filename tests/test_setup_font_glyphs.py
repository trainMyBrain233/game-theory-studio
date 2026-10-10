"""First-use and cache proofs must reject real TTC missing-glyph mappings."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

from fontTools.ttLib import TTCollection, TTFont
from test_notdef_glyph_coverage import make_face, setup_fonts

REQUIRED = '博'


def old_setup():
    source = Path(setup_fonts.__file__).read_text(encoding='utf-8')
    guard = "if name != '.notdef' and f.getGlyphID(name) != 0"
    if source.count(guard) != 1:
        raise RuntimeError('Expected one setup coverage guard for old-logic control')
    module = types.ModuleType('old_setup_membership')
    module.__file__ = setup_fonts.__file__
    exec(compile(source.replace(guard, 'if True'), module.__file__, 'exec'), module.__dict__)
    return module


def source_face(root, *, broken=False):
    source = root / 'NotoSansCJK-Regular.ttc'
    face = make_face('Sans', 'Regular', notdef=broken)
    if broken:
        for table in face['cmap'].tables:
            if table.isUnicode():
                table.cmap[ord(REQUIRED)] = '.notdef'
    collection = TTCollection()
    collection.fonts = [face]
    collection.save(source)
    collection.close()
    return source


class SetupGlyphTests(unittest.TestCase):
    def test_real_ttc_first_use_rejects_notdef_and_preserves_target(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = source_face(root, broken=True)
            target = root / 'NotoSansCJKSC-Regular.otf'
            # Old implementation accepts the same complete TTC and records real
            # source/extracted-byte hashes, without weakening pinned OTF rules.
            old = old_setup()
            previous = old.prepare(source, target, 'Sans', 'Regular')
            with TTFont(target) as font:
                self.assertEqual(font.getBestCmap()[ord(REQUIRED)], '.notdef')
                self.assertNotEqual(font.getGlyphID('.notdef'), 0)
            self.assertEqual(old.verify_cached(target, 'Sans', 'Regular', previous)['sha256'], previous['sha256'])
            target.write_bytes(b'existing target must survive failed preparation')
            before = target.read_bytes()
            with self.assertRaisesRegex(ValueError, 'missing Chinese glyphs.*博'):
                setup_fonts.prepare(source, target, 'Sans', 'Regular')
            self.assertEqual(target.read_bytes(), before)
            self.assertFalse(target.with_suffix('.tmp.otf').exists())

    def test_real_ttc_cached_legacy_proof_is_rejected_without_rewriting(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = source_face(root, broken=True)
            target = root / 'NotoSansCJKSC-Regular.otf'
            previous = old_setup().prepare(source, target, 'Sans', 'Regular')
            before = target.read_bytes(), source.read_bytes(), dict(previous)
            with self.assertRaisesRegex(ValueError, 'missing Chinese glyphs.*博'):
                setup_fonts.verify_cached(target, 'Sans', 'Regular', previous)
            self.assertEqual((target.read_bytes(), source.read_bytes(), previous), before)
            manifest = root / 'prepared_font_manifest.json'
            manifest.write_text(json.dumps({target.name: previous}), encoding='utf-8')
            manifest_bytes = manifest.read_bytes()
            expected = {'manifestSha256': hashlib.sha256(manifest_bytes).hexdigest(),
                        'fonts': [{'kind': 'Sans', 'weight': 'Regular', 'sha256': previous['sha256']}]}
            verifier = Path(setup_fonts.__file__).resolve().parents[1] / 'typography/verify-fonts.py'
            # The renderer's real first-registration adapter must fail before
            # returning any success proof, even for a legacy accepted manifest.
            result = subprocess.run([sys.executable, *(['-' + 'O' * sys.flags.optimize] if sys.flags.optimize else []),
                                     str(verifier)], input=json.dumps({'fontDir': str(root), 'expected': expected}),
                                    capture_output=True, text=True, timeout=30)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('missing Chinese glyphs', result.stderr)
            self.assertIn(REQUIRED, result.stderr)
            self.assertEqual(result.stdout, '')
            self.assertEqual(manifest.read_bytes(), manifest_bytes)
            self.assertEqual((target.read_bytes(), source.read_bytes(), previous), before)

    def test_real_ttc_valid_preparation_and_cache_keep_provenance(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = source_face(root)
            target = root / 'NotoSansCJKSC-Regular.otf'
            previous = setup_fonts.prepare(source, target, 'Sans', 'Regular')
            self.assertEqual(previous['source_sha256'], hashlib.sha256(source.read_bytes()).hexdigest())
            self.assertEqual(previous['face_index'], 0)
            self.assertEqual(previous['source_kind'], 'local_ttc_extraction')
            self.assertEqual(setup_fonts.verify_cached(target, 'Sans', 'Regular', previous), previous)

    def test_real_ttfont_id_zero_alias_rejected_before_preparation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = source_face(root)
            target = root / 'NotoSansCJKSC-Regular.otf'
            # FontTools strips serialized ID0 entries, so exercise its real
            # cmap and glyph-ID tables at the loading boundary for this case.
            def open_zero_alias(path, **kwargs):
                font = TTFont(path, **kwargs)
                order = font.getGlyphOrder()
                order[0] = 'missingAlias'
                font.setGlyphOrder(order)
                font.getBestCmap()[ord(REQUIRED)] = 'missingAlias'
                self.assertEqual(font.getGlyphID('missingAlias'), 0)
                return font
            with patch.object(setup_fonts, 'TTFont', open_zero_alias):
                with self.assertRaisesRegex(ValueError, 'missing Chinese glyphs.*博'):
                    setup_fonts.prepare(source, target, 'Sans', 'Regular')
            self.assertFalse(target.exists())
            self.assertFalse(target.with_suffix('.tmp.otf').exists())


class OptimizationModes(unittest.TestCase):
    def test_first_use_regressions_survive_optimization(self):
        for flags in [[], ['-O'], ['-OO']]:
            with self.subTest(flags=flags):
                env = os.environ.copy()
                env.pop('PYTHONOPTIMIZE', None)
                result = subprocess.run([sys.executable, *flags, str(Path(__file__).resolve()),
                                         'SetupGlyphTests'], env=env, capture_output=True,
                                        text=True, timeout=120)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn('Ran 4 tests', result.stderr)


if __name__ == '__main__':
    unittest.main()
