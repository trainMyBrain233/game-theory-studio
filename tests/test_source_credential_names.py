"""Credential-shaped paths must never enter public artifacts or diagnostics."""
from pathlib import Path
import os
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import test_source_archive_paths as archive_paths
import test_source_read_bounds as bounds
import test_public_source_boundaries as boundary_tests
from qa_source import credential_patterns, scan_sources, validate_source_path


# Synthetic values are assembled at runtime so this test remains public source.
def credential_fixtures():
    return [
        ('github', 'gh' + 'p_' + 'a' * 36),
        ('github-pat', 'github_' + 'pat_' + 'a' * 50),
        ('aws', 'AK' + 'IA' + 'A' * 16),
        ('slack', 'xox' + 'b-' + 'a' * 24),
        ('openai', 'sk' + '-proj-' + 'a' * 36),
        ('private-key', '-----BEGIN RSA PRIVATE' + ' KEY-----'),
    ]


def command(root, entry, flags, optimization):
    env = {key: value for key, value in os.environ.items() if key != 'PYTHONOPTIMIZE'}
    env['PYTHONDONTWRITEBYTECODE'] = '1'
    if optimization:
        env['PYTHONOPTIMIZE'] = optimization
    script, arguments = {
        'qa': ('scripts/qa_source.py', []),
        'pack': ('production/pack_source.py', ['--public']),
        'verify': ('production/verify_source_archive.py', [str(root)]),
    }[entry]
    return subprocess.run([sys.executable, *flags, str(archive_paths.ROOT / script)
                           if entry == 'verify' else script, *arguments],
                          cwd=root, env=env, capture_output=True, text=True, timeout=20)


class SourceCredentialNameTests(unittest.TestCase):
    def test_reject_paths_before_access_and_match_independent_verifier(self):
        self.assertEqual({pattern.pattern for pattern in credential_patterns.values()},
                         {pattern.pattern for pattern in archive_paths.verifier.CREDENTIAL_PATTERNS})
        for kind, token in credential_fixtures():
            for name in [token + '.txt', 'nested/' + token + '/ordinary.txt', '../' + token + '.txt']:
                with self.subTest(kind=kind), \
                     patch.object(Path, 'stat', side_effect=AssertionError('must reject before access')), \
                     patch.object(Path, 'lstat', side_effect=AssertionError('must reject before access')), \
                     patch.object(Path, 'open', side_effect=AssertionError('must reject before access')):
                    errors, size = scan_sources(Path('.'), iter(['ordinary.txt', name]))
                    self.assertEqual(size, 0)
                    self.assertEqual(errors, [('[redacted filename]', 'Credential-like public source filename')])
                    self.assertNotIn(token, repr(errors))
                    for validate in [validate_source_path, archive_paths.pack.validate_source_path,
                                     archive_paths.verifier.validate_source_path]:
                        with self.assertRaisesRegex(ValueError, 'Credential-like') as caught:
                            validate(name)
                        self.assertNotIn(token, str(caught.exception))
                    with self.assertRaisesRegex(ValueError, 'Credential-like'):
                        archive_paths.pack.source_candidates(Path('.'), name.encode() + b'\0')

    def test_tracked_and_untracked_names_fail_qa_and_pack_without_leaking_all_modes(self):
        for kind, token in credential_fixtures():
            for tracked in [False, True]:
                with self.subTest(kind=kind, tracked=tracked), tempfile.TemporaryDirectory() as temporary:
                    root = Path(temporary)
                    archive_paths.SourceArchivePathTests.checkout(root)
                    name = 'nested/' + token + ('/ordinary.txt' if tracked else '.txt')
                    target = root / name
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text('payload-must-not-be-echoed', encoding='utf-8')
                    if tracked:
                        subprocess.run(['git', 'add', '--', name], cwd=root, check=True, capture_output=True)
                    destination = bounds.SourceReadBoundsTests.previous_archive(root)
                    before = {p.relative_to(root): p.read_bytes() for p in root.rglob('*')
                              if p.is_file() and '.git' not in p.relative_to(root).parts}
                    for flags, optimization in bounds.MODES:
                        for entry in ['qa', 'pack']:
                            result = command(root, entry, flags, optimization)
                            output = result.stdout + result.stderr
                            self.assertNotEqual(result.returncode, 0, output)
                            self.assertIn('Credential-like public source filename', output)
                            self.assertNotIn(token, output)
                            self.assertNotIn('payload-must-not-be-echoed', output)
                            self.assertNotIn('Traceback', output)
                            self.assertEqual(destination.read_bytes(), b'previous-archive-must-survive')
                    after = {p.relative_to(root): p.read_bytes() for p in root.rglob('*')
                             if p.is_file() and '.git' not in p.relative_to(root).parts}
                    self.assertEqual(before, after)

    def test_manifest_names_reject_before_source_reads_and_import_all_modes(self):
        for kind, token in credential_fixtures():
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                boundary_tests.ArchiveBoundaryTests.fixture(root, {token + '/ordinary.txt': b'ordinary source'})
                with patch.object(archive_paths.verifier, 'verify_source_bytes',
                                  side_effect=AssertionError('must reject before source reads')), \
                     patch.object(archive_paths.verifier.importlib.util, 'spec_from_file_location') as imported:
                    with self.assertRaisesRegex(ValueError, 'Credential-like manifest path'):
                        archive_paths.verifier.verify_archive(root)
                    imported.assert_not_called()
                for flags, optimization in bounds.MODES:
                    result = command(root, 'verify', flags, optimization)
                    output = result.stdout + result.stderr
                    self.assertNotEqual(result.returncode, 0, output)
                    self.assertIn('Credential-like manifest path', output)
                    self.assertNotIn(token, output)
                    self.assertNotIn('Traceback', output)

    def test_ordinary_names_pack_and_verify_unchanged_in_all_modes(self):
        names = ['ordinary.txt', 'nested/中文.txt', 'github-token-example.txt',
                 'gh' + 'p_short.txt', 'nested/sketch-projection.txt']
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'checkout'; root.mkdir()
            archive_paths.SourceArchivePathTests.checkout(root)
            for name in names:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b'ordinary source')
            subprocess.run(['git', 'add', '--', names[0]], cwd=root, check=True, capture_output=True)
            for flags, optimization in bounds.MODES:
                for entry in ['qa', 'pack']:
                    result = command(root, entry, flags, optimization)
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                with tempfile.TemporaryDirectory() as extraction:
                    with zipfile.ZipFile(root / 'production/output/game_theory_studio_public_source.zip') as archive:
                        for name in names:
                            self.assertEqual(archive.read('game-theory-studio/' + name), b'ordinary source')
                        archive.extractall(extraction)
                    result = command(Path(extraction) / 'game-theory-studio', 'verify', flags, optimization)
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
