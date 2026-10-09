"""Correct font bytes do not excuse forged canonical provenance metadata."""
import contextlib
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from test_notdef_glyph_coverage import CURRENT, ROOT, make_face, setup_fonts
from fontTools.ttLib import TTCollection


class CanonicalProvenanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temporary.name)
        cls.target = cls.root / 'NotoSansCJKSC-Regular.otf'
        font = make_face('Sans', 'Regular')
        font.save(cls.target)
        cls.sha = hashlib.sha256(cls.target.read_bytes()).hexdigest()
        # A controlled, known-byte pin exercises the official branch without
        # bundling licensed Noto bytes or trusting mocked metadata inspection.
        with patch.dict(setup_fonts.OFFICIAL_SHA256, {('Sans', 'Regular'): cls.sha}):
            cls.entry = setup_fonts.prepare(cls.target, cls.root / 'copy.otf', 'Sans', 'Regular', CURRENT)
        cls.manifest = cls.root / 'prepared_font_manifest.json'

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def check_adapter(self, previous, *, valid=False):
        self.manifest.write_text(json.dumps({self.target.name: previous}), encoding='utf-8')
        before = self.manifest.read_bytes(), self.target.read_bytes()
        expected = {'manifestSha256': hashlib.sha256(before[0]).hexdigest(),
                    'fonts': [{'kind': 'Sans', 'weight': 'Regular', 'sha256': self.sha}],
                    'inventory': {'characters': CURRENT}}
        stdout = io.StringIO()
        with (patch.dict(setup_fonts.OFFICIAL_SHA256, {('Sans', 'Regular'): self.sha}),
              patch.object(sys, 'stdin', io.StringIO(json.dumps({'fontDir': str(self.root), 'expected': expected}))),
              patch.object(sys, 'path', sys.path.copy()),
              patch.object(sys, 'dont_write_bytecode', True), contextlib.redirect_stdout(stdout)):
            if valid:
                runpy.run_path(str(ROOT / 'typography/verify-fonts.py'), run_name='__main__')
                self.assertEqual(json.loads(stdout.getvalue())['expected'], expected)
            else:
                with self.assertRaisesRegex(SystemExit, 'manifest does not match'):
                    runpy.run_path(str(ROOT / 'typography/verify-fonts.py'), run_name='__main__')
                self.assertEqual(stdout.getvalue(), '')
        self.assertEqual((self.manifest.read_bytes(), self.target.read_bytes()), before)

    def test_official_every_canonical_field_is_required_and_verified_on_first_use(self):
        self.check_adapter(self.entry, valid=True)
        for field, original in self.entry.items():
            for missing in (False, True):
                with self.subTest(field=field, missing=missing):
                    forged = copy.deepcopy(self.entry)
                    if missing:
                        del forged[field]
                    else:
                        forged[field] = {'family': 'False family', 'weight': 700,
                                         'version': ['Version 9.999; forged'], 'glyph_count': 20001,
                                         'sha256': '0' * 64, 'source': 'https://example.invalid/font.otf',
                                         'face_index': 0, 'source_sha256': 'f' * 64,
                                         'source_kind': 'local_ttc_extraction'}[field]
                    self.check_adapter(forged)
                    self.check_verify_only(forged, field)

    def test_official_optional_annotations_are_preserved_and_typed_fields_reject_bool(self):
        annotated = dict(self.entry, note='legitimate legacy annotation')
        self.check_adapter(annotated, valid=True)
        self.check_adapter(dict(self.entry, face_index=False))

    def check_verify_only(self, forged, field):
        self.manifest.write_text(json.dumps({self.target.name: forged}), encoding='utf-8')
        before = self.manifest.read_bytes(), self.target.read_bytes()
        stdout, stderr = io.StringIO(), io.StringIO()
        with (patch.dict(setup_fonts.OFFICIAL_SHA256, {('Sans', 'Regular'): self.sha}),
              patch.object(setup_fonts, 'current_characters', return_value=CURRENT),
              patch.object(sys, 'argv', ['setup_fonts.py', '--verify-only', '--output-dir', str(self.root)]),
              contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr)):
            self.assertEqual(setup_fonts.main(), 1)
        self.assertIn('independently verified provenance: ' + field, stderr.getvalue())
        self.assertNotIn('Verified NotoSansCJKSC-Regular', stdout.getvalue())
        self.assertEqual((self.manifest.read_bytes(), self.target.read_bytes()), before)

    def test_verify_only_rejects_metadata_with_correct_hash_without_rewriting(self):
        self.check_verify_only(dict(self.entry, family='False family'), 'family')

    def test_real_ttc_canonical_fields_and_original_files_are_preserved(self):
        source = self.root / 'source.ttc'
        collection = TTCollection(); collection.fonts = [make_face('Sans', 'Regular')]
        collection.save(source); collection.close()
        target = self.root / 'derived.otf'
        entry = setup_fonts.prepare(source, target, 'Sans', 'Regular', CURRENT)
        before = source.read_bytes(), target.read_bytes()
        self.assertEqual(setup_fonts.verify_cached(target, 'Sans', 'Regular', entry, CURRENT), entry)
        for field in ('family', 'weight', 'version', 'glyph_count', 'source_kind', 'source_sha256', 'source', 'face_index', 'sha256'):
            for missing in (False, True):
                with self.subTest(field=field, missing=missing):
                    forged = copy.deepcopy(entry)
                    if missing:
                        del forged[field]
                    else:
                        forged[field] = 'false provenance'
                    with self.assertRaises((ValueError, TypeError)):
                        setup_fonts.verify_cached(target, 'Sans', 'Regular', forged, CURRENT)
                    self.assertEqual((source.read_bytes(), target.read_bytes()), before)
        with self.assertRaisesRegex(ValueError, 'face_index'):
            setup_fonts.verify_cached(target, 'Sans', 'Regular', dict(entry, face_index=False), CURRENT)


class OptimizationModes(unittest.TestCase):
    def test_regressions_survive_optimization(self):
        for flags in [[], ['-O'], ['-OO']]:
            with self.subTest(flags=flags):
                env = os.environ.copy(); env.pop('PYTHONOPTIMIZE', None)
                result = subprocess.run([sys.executable, *flags, str(Path(__file__).resolve()),
                                         'CanonicalProvenanceTests'], env=env, capture_output=True,
                                        text=True, timeout=120)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn('Ran 4 tests', result.stderr)


if __name__ == '__main__':
    unittest.main()
