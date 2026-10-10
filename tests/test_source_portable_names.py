"""Development QA and publication enforce one portable candidate-name contract."""
from pathlib import Path
import errno
import os
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import test_source_archive_paths as archive_paths
import test_source_read_bounds as bounds
from qa_source import scan_sources, validate_source_path


# Keep this unconditional: some filesystems (including common macOS volumes)
# cannot represent non-UTF-8 names at all. Replace only Git's candidate bytes;
# execute both real CLI main paths and the real checkout check in a subprocess.
INVALID_GIT_CANDIDATE = r'''
import runpy
import subprocess
import sys
original = subprocess.check_output
calls = 0

def candidate_bytes(command, *args, **kwargs):
    global calls
    if command == ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z']:
        calls += 1
        return b'ordinary.txt\0invalid-\xff.txt\0'
    return original(command, *args, **kwargs)

subprocess.check_output = candidate_bytes
entry = sys.argv[1]
sys.argv = [entry] + (['--public'] if 'pack_source' in entry else [])
try:
    runpy.run_path(entry, run_name='__main__')
finally:
    print(f'SYNTHETIC_GIT_CANDIDATES calls={calls}')
'''


class PortableSourceNameTests(unittest.TestCase):
    def assert_cli_parity(self, root, reason=None, runner=None):
        destination = bounds.SourceReadBoundsTests.previous_archive(root)
        for flags, optimization in bounds.MODES:
            for entry in ['qa', 'pack']:
                with self.subTest(entry=entry, flags=flags, optimization=optimization):
                    before = {path.relative_to(root): path.read_bytes() for path in root.rglob('*')
                              if path.is_file() and '.git' not in path.relative_to(root).parts}
                    result = (runner or bounds.SourceReadBoundsTests.command)(root, entry, flags, optimization)
                    output = result.stdout + result.stderr
                    if reason:
                        self.assertNotEqual(result.returncode, 0, output)
                        self.assertIn(reason, output)
                        self.assertNotIn('Traceback', output)
                        self.assertNotIn('payload-must-not-be-echoed', output)
                    else:
                        self.assertEqual(result.returncode, 0, output)
                    after = {path.relative_to(root): path.read_bytes() for path in root.rglob('*')
                             if path.is_file() and '.git' not in path.relative_to(root).parts}
                    if reason or entry == 'qa':
                        self.assertEqual(before, after, 'QA and rejected packaging must be read-only')
        if reason:
            self.assertEqual(destination.read_bytes(), b'previous-archive-must-survive')

    @unittest.skipUnless(os.name == 'posix', 'Windows cannot create these native filenames')
    def test_reserved_and_control_native_git_candidates(self):
        for name in ['CON.txt', 'nested/LPT2.txt', 'source' + chr(9) + '.txt',
                     'source' + chr(10) + '.txt', 'source' + chr(27) + '.txt']:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                archive_paths.SourceArchivePathTests.checkout(root)
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text('payload-must-not-be-echoed', encoding='utf-8')
                self.assert_cli_parity(root, 'Unsafe public source filename')

    def test_native_case_and_unicode_alias_candidates(self):
        for names in [['Foo.js', 'foo.js'], ['café.txt', 'cafe\u0301.txt']]:
            with self.subTest(names=names), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                archive_paths.SourceArchivePathTests.checkout(root)
                for name in names:
                    (root / name).write_text('payload-must-not-be-echoed', encoding='utf-8')
                # Test native aliases on any filesystem that distinguishes them,
                # including case-sensitive macOS; synthetic coverage below is unconditional.
                if (root / names[0]).samefile(root / names[1]):
                    self.skipTest('Temporary filesystem aliases these spellings; synthetic rejection remains covered')
                self.assert_cli_parity(root, 'collide after portable normalization')

    def test_all_names_are_validated_before_any_filesystem_access(self):
        cases = [['ordinary.txt', 'CON.txt'], ['ordinary.txt', 'bad' + chr(10) + '.txt'],
                 ['Foo.js', 'foo.js'], ['Docs/a.txt', 'docs/b.txt'],
                 ['Tree', 'tree/leaf.txt'], ['café.txt', 'cafe\u0301.txt'],
                 ['Café/a.txt', 'Cafe\u0301/b.txt'], ['straße.txt', 'strasse.txt']]
        for names in cases:
            with self.subTest(names=names), \
                 patch.object(Path, 'stat', side_effect=AssertionError('must validate before file access')), \
                 patch.object(Path, 'lstat', side_effect=AssertionError('must validate before file access')), \
                 patch.object(Path, 'open', side_effect=AssertionError('must validate before file access')):
                errors, total = scan_sources(Path('.'), iter(names))
                self.assertTrue(errors)
                self.assertEqual(total, 0)
                with self.assertRaises(ValueError):
                    archive_paths.pack.source_candidates(Path('.'), b'\0'.join(name.encode() for name in names))

    def test_shared_contract_matches_standalone_verifier(self):
        for name in archive_paths.unsafe_names() + [None, 3, [], {}]:
            with self.subTest(name=name):
                for validator in [validate_source_path, archive_paths.pack.validate_source_path,
                                  archive_paths.verifier.validate_source_path]:
                    with self.assertRaises(ValueError):
                        validator(name)
        for name in ['normal.txt', 'nested/中文.txt', 'directory with spaces/source.txt',
                     'CONSOLE.txt', 'COM10.txt', 'docs/SOURCE_MANIFEST.json']:
            with self.subTest(name=name):
                self.assertIsNone(validate_source_path(name))
                self.assertIsNone(archive_paths.pack.validate_source_path(name))
                self.assertEqual(archive_paths.verifier.validate_source_path(name).as_posix(), name)
        self.assertIs(archive_paths.pack.portable_path_collision,
                      archive_paths.pack._source_guard.portable_path_collision)

    @unittest.skipUnless(os.name == 'posix', 'Non-UTF-8 native names require POSIX byte paths')
    def test_non_utf8_git_candidate_has_clean_rejection(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive_paths.SourceArchivePathTests.checkout(root)
            self.write_non_utf8_native_candidate(root)
            self.assert_cli_parity(root, 'filenames must be UTF-8')

    @staticmethod
    def write_non_utf8_native_candidate(root):
        try:
            stream = open(os.fsencode(root) + b'/invalid-\xff.txt', 'wb')
        except OSError as error:
            # EILSEQ is an actual filename capability limitation, not a QA
            # failure. Never conceal permission, disk-full, or unrelated errors.
            if error.errno == errno.EILSEQ:
                raise unittest.SkipTest('Filesystem rejects non-UTF-8 filenames; synthetic CLI coverage still runs') from error
            raise
        with stream:
            stream.write(b'payload-must-not-be-echoed')

    def test_native_capability_skip_is_limited_to_illegal_byte_sequence(self):
        for code in [errno.EILSEQ, errno.EACCES, errno.ENOSPC]:
            with self.subTest(errno=code), patch('builtins.open', side_effect=OSError(code, 'synthetic failure')):
                expected = unittest.SkipTest if code == errno.EILSEQ else OSError
                with self.assertRaises(expected):
                    self.write_non_utf8_native_candidate(Path('.'))

    def test_synthetic_non_utf8_git_bytes_reach_both_real_cli_guards(self):
        def command(root, entry, flags, optimization):
            env = {key: value for key, value in os.environ.items() if key != 'PYTHONOPTIMIZE'}
            env['PYTHONDONTWRITEBYTECODE'] = '1'
            if optimization:
                env['PYTHONOPTIMIZE'] = optimization
            script = 'scripts/qa_source.py' if entry == 'qa' else 'production/pack_source.py'
            result = subprocess.run([sys.executable, *flags, '-c', INVALID_GIT_CANDIDATE, script],
                                    cwd=root, env=env, capture_output=True, text=True, timeout=20)
            self.assertIn('SYNTHETIC_GIT_CANDIDATES calls=1', result.stdout)
            return result

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive_paths.SourceArchivePathTests.checkout(root)
            self.assert_cli_parity(root, 'filenames must be UTF-8', runner=command)

    def test_normal_nested_tracked_and_untracked_candidates(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive_paths.SourceArchivePathTests.checkout(root)
            for name in ['nested/normal.txt', 'nested/another.txt', '中文目录/源文件.txt']:
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text('ordinary source', encoding='utf-8')
            subprocess.run(['git', 'add', 'nested/normal.txt'], cwd=root, check=True, capture_output=True)
            self.assert_cli_parity(root)


if __name__ == '__main__':
    unittest.main()
