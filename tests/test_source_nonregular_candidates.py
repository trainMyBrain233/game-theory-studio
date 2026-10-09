"""Real Git candidates must never disappear silently at publication boundaries."""
from pathlib import Path
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import test_source_archive_paths as archive_paths
import test_source_read_bounds as bounds

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from qa_source import scan_sources


class NonregularSourceCandidateTests(unittest.TestCase):
    def assert_rejected(self, root, qa_reason, pack_reason):
        destination = bounds.SourceReadBoundsTests.previous_archive(root)
        for flags, optimization in bounds.MODES:
            for entry, reason in [('qa', qa_reason), ('pack', pack_reason)]:
                with self.subTest(entry=entry, flags=flags, optimization=optimization):
                    result = bounds.SourceReadBoundsTests.command(root, entry, flags, optimization)
                    output = result.stdout + result.stderr
                    self.assertNotEqual(result.returncode, 0, output)
                    self.assertIn(reason, output)
                    self.assertNotIn('Traceback', output)
                    self.assertNotIn('private-payload-must-not-be-read', output)
                    self.assertEqual(destination.read_bytes(), b'previous-archive-must-survive')
                    self.assertEqual(list(destination.parent.iterdir()), [destination])

    def test_real_gitlink_is_rejected_without_recursing_into_submodule(self):
        for populated in [False, True]:
            with self.subTest(populated=populated), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                archive_paths.SourceArchivePathTests.checkout(root)
                nested = root / 'vendor'
                nested.mkdir()
                # Create a real commit object and mode-160000 index entry. No
                # network, external repository, or submodule URL is involved.
                subprocess.run(['git', 'init', '-q', str(nested)], check=True, capture_output=True)
                (nested / 'private.txt').write_text('private-payload-must-not-be-read', encoding='utf-8')
                subprocess.run(['git', 'add', 'private.txt'], cwd=nested, check=True, capture_output=True)
                subprocess.run(['git', '-c', 'user.name=Source Test', '-c', 'user.email=source@example.invalid',
                                'commit', '-qm', 'Synthetic submodule'], cwd=nested, check=True, capture_output=True)
                commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=nested).decode().strip()
                subprocess.run(['git', 'update-index', '--add', '--cacheinfo', f'160000,{commit},vendor'],
                               cwd=root, check=True, capture_output=True)
                if not populated:
                    shutil.rmtree(nested)
                    nested.mkdir()
                candidates = subprocess.check_output(['git', 'ls-files', '--cached', '--others',
                                                      '--exclude-standard', '-z'], cwd=root).split(b'\0')
                self.assertIn(b'vendor', candidates)
                self.assertNotIn(b'vendor/private.txt', candidates)
                self.assert_rejected(root, 'vendor: nonregular or missing source candidate',
                                     'Nonregular public source candidate or parent')

    def test_tracked_file_replaced_by_directory_or_missing_is_rejected(self):
        for kind in ['directory', 'missing']:
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                archive_paths.SourceArchivePathTests.checkout(root)
                target = root / 'candidate.txt'
                target.write_text('original source', encoding='utf-8')
                subprocess.run(['git', 'add', 'candidate.txt'], cwd=root, check=True, capture_output=True)
                target.unlink()
                if kind == 'directory':
                    target.mkdir()
                self.assert_rejected(root, 'candidate.txt: nonregular or missing source candidate',
                                     'Nonregular public source candidate' if kind == 'directory'
                                     else 'Missing public source candidate')
                if kind == 'missing':
                    # An explicitly staged deletion removes the candidate and
                    # restores both development QA and archive publication.
                    subprocess.run(['git', 'add', '-u'], cwd=root, check=True, capture_output=True)
                    for entry in ['qa', 'pack']:
                        result = bounds.SourceReadBoundsTests.command(root, entry)
                        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    with zipfile.ZipFile(root / 'production/output/game_theory_studio_public_source.zip') as archive:
                        self.assertNotIn('game-theory-studio/candidate.txt', archive.namelist())

    @unittest.skipUnless(os.name == 'posix', 'POSIX filesystem objects required')
    def test_special_files_and_symlink_guards_reject_before_opening(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'directory').mkdir()
            os.mkfifo(root / 'fifo')
            (root / 'regular.txt').write_text('source', encoding='utf-8')
            (root / 'link').symlink_to('regular.txt')
            (root / 'parent-link').symlink_to('directory', target_is_directory=True)
            for name in ['directory', 'missing', 'fifo', 'link', 'parent-link/child.txt']:
                with self.subTest(name=name), patch.object(Path, 'open', side_effect=AssertionError('must not read')):
                    errors, total = scan_sources(root, [name])
                    self.assertEqual(errors, [(name, 'symlinks are not source artifacts' if 'link' in name
                                                else 'nonregular or missing source candidate')])
                    self.assertEqual(total, 0)

    def test_tracked_and_untracked_regular_sources_pass_real_entry_points(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive_paths.SourceArchivePathTests.checkout(root)
            (root / 'tracked.txt').write_text('tracked original source', encoding='utf-8')
            subprocess.run(['git', 'add', 'tracked.txt'], cwd=root, check=True, capture_output=True)
            (root / 'empty-untracked-directory').mkdir()
            (root / 'ordinary-directory').mkdir()
            (root / 'ordinary-directory/source.txt').write_text('nested regular source', encoding='utf-8')
            (root / 'untracked.txt').write_text('untracked original source', encoding='utf-8')
            for flags, optimization in bounds.MODES:
                for entry in ['qa', 'pack']:
                    with self.subTest(entry=entry, flags=flags, optimization=optimization):
                        result = bounds.SourceReadBoundsTests.command(root, entry, flags, optimization)
                        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                with zipfile.ZipFile(root / 'production/output/game_theory_studio_public_source.zip') as archive:
                    for name in ['tracked.txt', 'untracked.txt', 'ordinary-directory/source.txt']:
                        self.assertEqual(archive.read('game-theory-studio/' + name), (root / name).read_bytes())


if __name__ == '__main__':
    unittest.main()
