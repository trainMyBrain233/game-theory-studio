"""Exercise the read-only Python adapter without importing FontTools or fonts."""
import contextlib
import hashlib
import io
import json
from pathlib import Path
import runpy
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

VERIFIER = Path(__file__).resolve().parents[1] / 'typography/verify-fonts.py'


class FontRegistrationVerifierTests(unittest.TestCase):
    def run_verifier(self, *, mismatch=False, source_changed=False):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            target = directory / 'NotoSerifCJKSC-Bold.otf'
            target.write_bytes(b'controlled font fixture')
            digest = hashlib.sha256(target.read_bytes()).hexdigest()
            manifest = directory / 'prepared_font_manifest.json'
            manifest.write_text(json.dumps({target.name: {'sha256': 'wrong' if mismatch else digest}}))
            manifest_bytes = manifest.read_bytes()
            source = directory / 'original.ttc'
            source.write_bytes(b'controlled TTC fixture')
            expected = {'fonts': [{'kind': 'Serif', 'weight': 'Bold', 'sha256': digest}],
                        'manifestSha256': hashlib.sha256(manifest_bytes).hexdigest()}
            calls = []

            def verify_cached(actual, kind, weight, previous, required_characters=None):
                calls.append((actual, kind, weight, previous))
                return {'sha256': digest, 'source_kind': 'local_ttc_extraction', 'source': str(source),
                        'source_sha256': 'wrong' if source_changed else hashlib.sha256(source.read_bytes()).hexdigest()}

            stdin = io.StringIO(json.dumps({'fontDir': str(directory), 'expected': expected}))
            stdout = io.StringIO()
            fake_setup = types.SimpleNamespace(verify_cached=verify_cached)
            with (patch.dict(sys.modules, {'setup_fonts': fake_setup}),
                  patch.object(sys, 'stdin', stdin), patch.object(sys, 'path', sys.path.copy()),
                  patch.object(sys, 'dont_write_bytecode', True), contextlib.redirect_stdout(stdout)):
                if mismatch or source_changed:
                    with self.assertRaisesRegex(SystemExit, 'manifest does not match|source changed'):
                        runpy.run_path(str(VERIFIER), run_name='__main__')
                else:
                    runpy.run_path(str(VERIFIER), run_name='__main__')
                    result = json.loads(stdout.getvalue())
                    self.assertEqual(result['expected'], expected)
                    self.assertEqual(result['sources'], {str(source.resolve()): hashlib.sha256(source.read_bytes()).hexdigest()})
            self.assertEqual(len(calls), 1)
            self.assertEqual(calls[0][:3], (target, 'Serif', 'Bold'))
            self.assertEqual(manifest.read_bytes(), manifest_bytes)
            self.assertEqual(target.read_bytes(), b'controlled font fixture')

    def test_delegates_the_exact_face_to_the_existing_trust_contract(self):
        self.run_verifier()

    def test_rejects_a_manifest_that_disagrees_with_independent_verification(self):
        self.run_verifier(mismatch=True)

    def test_rejects_source_changes_during_verification(self):
        self.run_verifier(source_changed=True)


if __name__ == '__main__':
    unittest.main()
