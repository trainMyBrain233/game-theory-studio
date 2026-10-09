"""Producer integrity and candidate completeness; no renderer or large-file fixtures."""
from pathlib import Path
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import test_source_archive_paths as path_tests

ROOT, pack, verifier = path_tests.ROOT, path_tests.pack, path_tests.verifier

MODES = [([], None), (['-O'], None), (['-OO'], None), ([], '1'), ([], '2')]


class ProducerIntegrityTests(unittest.TestCase):
    @staticmethod
    def commit(root):
        for args in [['add', '.'], ['-c', 'user.name=Archive Fixture', '-c', 'user.email=archive@example.invalid',
                                    'commit', '-qm', 'synthetic source fixture']]:
            subprocess.run(['git', *args], cwd=root, check=True, capture_output=True)

    @staticmethod
    def command(root, flags=(), optimization=None, code=None):
        env = {key: value for key, value in os.environ.items() if key != 'PYTHONOPTIMIZE'}
        if optimization:
            env['PYTHONOPTIMIZE'] = optimization
        args = [sys.executable, *flags]
        args += ['-c', code, str(root)] if code else [str(root / 'production/pack_source.py'), '--public']
        return subprocess.run(args, env=env, capture_output=True, text=True, timeout=15)

    @staticmethod
    def existing_archive(root):
        destination = root / 'production/output/game_theory_studio_public_source.zip'
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(b'preserve-existing-archive')
        return destination

    def assert_preserved(self, destination, result):
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertNotIn('CRC checked', result.stdout)
        self.assertEqual(destination.read_bytes(), b'preserve-existing-archive')
        self.assertEqual(list(destination.parent.iterdir()), [destination])

    def test_crc_duplicates_members_bytes_and_size_checks_survive_all_optimization_modes(self):
        # The real writer operates on a tiny checkout. Only its read-back result
        # or configured size limit is perturbed, keeping memory and disk bounded.
        harness = '''
from pathlib import Path
import importlib.util, sys
from unittest.mock import patch
root=Path(sys.argv[1]); spec=importlib.util.spec_from_file_location('producer',root/'production/pack_source.py')
p=importlib.util.module_from_spec(spec); spec.loader.exec_module(p)
sys.argv=['pack_source.py','--public']
kind=KIND
original_names=p.zipfile.ZipFile.namelist
original_read=p.zipfile.ZipFile.read
if kind=='crc': hook=patch.object(p.zipfile.ZipFile,'testzip',return_value='do-not-echo-corrupt-member')
elif kind=='duplicates': hook=patch.object(p.zipfile.ZipFile,'namelist',lambda self: original_names(self)+original_names(self)[:1])
elif kind=='missing': hook=patch.object(p.zipfile.ZipFile,'namelist',lambda self: original_names(self)[1:])
elif kind=='unexpected': hook=patch.object(p.zipfile.ZipFile,'namelist',lambda self: original_names(self)+['unexpected-member'])
elif kind=='bytes': hook=patch.object(p.zipfile.ZipFile,'read',lambda self,name,*args,**kwargs: original_read(self,name,*args,**kwargs)+b'changed')
else: hook=patch.object(p,'MAX_ARCHIVE_BYTES',1)
with hook: p.main()
'''
        for kind in ['crc', 'duplicates', 'missing', 'unexpected', 'bytes', 'size']:
            with tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary); path_tests.SourceArchivePathTests.checkout(root)
                destination = self.existing_archive(root)
                for flags, optimization in MODES:
                    with self.subTest(kind=kind, flags=flags, optimization=optimization):
                        result = self.command(root, flags, optimization, harness.replace('KIND', repr(kind)))
                        self.assert_preserved(destination, result)
                        self.assertNotIn('do-not-echo-corrupt-member', result.stdout + result.stderr)

    def test_exact_15_mib_limit_is_exclusive_without_allocating_a_large_file(self):
        self.assertEqual(pack.MAX_ARCHIVE_BYTES, 15 * 1024 * 1024)
        with patch.object(Path, 'stat', return_value=type('Size', (), {'st_size': pack.MAX_ARCHIVE_BYTES})()), \
             patch.object(pack.zipfile, 'ZipFile') as archive:
            with self.assertRaisesRegex(pack.ArchiveBuildError, 'smaller than 15 MiB'):
                pack.verify_written_archive(Path('synthetic.zip'), {})
            archive.assert_not_called()
        with patch.object(Path, 'stat', return_value=type('Size', (), {'st_size': pack.MAX_ARCHIVE_BYTES - 1})()), \
             patch.object(pack.zipfile, 'ZipFile') as archive:
            opened = archive.return_value.__enter__.return_value
            opened.testzip.return_value = None
            opened.namelist.return_value = []
            pack.verify_written_archive(Path('synthetic.zip'), {})

    @unittest.skipUnless(os.name == 'posix', 'Disposable symlink/FIFO fixtures require POSIX')
    def test_every_nonregular_tracked_candidate_is_rejected_before_payload_reads(self):
        for kind in ['missing', 'directory', 'dangling', 'file-link', 'directory-link', 'parent-link', 'fifo']:
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as temporary:
                base = Path(temporary); root = base / 'checkout'; root.mkdir()
                path_tests.SourceArchivePathTests.checkout(root)
                outside = base / 'synthetic-outside'; outside.mkdir()
                (outside / 'source.txt').write_bytes(b'synthetic-never-read-target')
                relative = 'nested/source.txt' if kind == 'parent-link' else 'source.txt'
                source = root / relative; source.parent.mkdir(parents=True, exist_ok=True)
                source.write_bytes(b'original source')
                self.commit(root)
                source.unlink()
                if kind == 'directory': source.mkdir()
                if kind == 'dangling': source.symlink_to(outside / 'missing')
                if kind == 'file-link': source.symlink_to(outside / 'source.txt')
                if kind == 'directory-link': source.symlink_to(outside, target_is_directory=True)
                if kind == 'parent-link':
                    source.parent.rmdir(); source.parent.symlink_to(outside, target_is_directory=True)
                if kind == 'fifo': os.mkfifo(source)
                with patch.object(Path, 'open', side_effect=AssertionError('must not read candidate bytes')):
                    with self.assertRaises((pack.ArchiveBuildError, OSError)):
                        pack.source_candidates(root, relative.encode() + b'\0')
                    with self.assertRaises((verifier.ArchiveValidationError, OSError)):
                        verifier.regular_source(root, Path(relative))
                destination = self.existing_archive(root)
                for flags, optimization in MODES:
                    result = self.command(root, flags, optimization)
                    self.assert_preserved(destination, result)
                    self.assertNotIn('synthetic-never-read-target', result.stdout + result.stderr)

    @unittest.skipUnless(os.name == 'posix', 'Disposable symlink fixtures require POSIX')
    def test_symlinked_output_parents_and_destination_are_rejected_without_target_writes(self):
        for kind in ['production-parent', 'output-parent', 'destination-link', 'destination-directory']:
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as temporary:
                base = Path(temporary); root = base / 'checkout'; root.mkdir()
                outside = base / 'synthetic-outside'; outside.mkdir()
                sentinel = outside / 'sentinel.txt'; sentinel.write_bytes(b'preserve-outside')
                if kind == 'production-parent':
                    (root / 'production').symlink_to(outside, target_is_directory=True)
                else:
                    (root / 'production').mkdir()
                    if kind == 'output-parent':
                        (root / 'production/output').symlink_to(outside, target_is_directory=True)
                    else:
                        (root / 'production/output').mkdir()
                        destination = root / 'production/output/game_theory_studio_public_source.zip'
                        if kind == 'destination-link': destination.symlink_to(sentinel)
                        else: destination.mkdir()
                with self.assertRaises(pack.ArchiveBuildError): pack.output_destination(root)
                self.assertEqual(list(outside.iterdir()), [sentinel])
                self.assertEqual(sentinel.read_bytes(), b'preserve-outside')
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary); root = base / 'checkout'; root.mkdir()
            path_tests.SourceArchivePathTests.checkout(root)
            outside = base / 'synthetic-outside'; outside.mkdir()
            (root / 'production/output').symlink_to(outside, target_is_directory=True)
            # Ignore the link itself so this exercises the output boundary after
            # candidate validation, rather than the earlier source-link rejection.
            ignore = root / '.gitignore'
            ignore.write_text(ignore.read_text() + 'production/output\n')
            for flags, optimization in MODES:
                result = self.command(root, flags, optimization)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('output parent', result.stderr)
                self.assertEqual(list(outside.iterdir()), [])

    def test_final_rechecks_reject_changed_membership_bytes_and_nonregular_replacements(self):
        harness = '''
from pathlib import Path
import importlib.util, sys
from unittest.mock import patch
root=Path(sys.argv[1]); spec=importlib.util.spec_from_file_location('producer',root/'production/pack_source.py')
p=importlib.util.module_from_spec(spec); spec.loader.exec_module(p)
sys.argv=['pack_source.py','--public']; original=p.verify_written_archive
kind=KIND
def check(path,expected):
 original(path,expected)
 source=root/'source.txt'
 if kind=='added': (root/'new-source.txt').write_text('new synthetic source')
 elif kind=='removed': source.unlink()
 elif kind=='bytes': source.write_text('changed synthetic source')
 elif kind=='directory': source.unlink(); source.mkdir()
with patch.object(p,'verify_written_archive',check): p.main()
'''
        for kind in ['added', 'removed', 'bytes', 'directory']:
            for flags, optimization in MODES:
                with self.subTest(kind=kind, flags=flags, optimization=optimization), tempfile.TemporaryDirectory() as temporary:
                    root = Path(temporary); path_tests.SourceArchivePathTests.checkout(root)
                    (root / 'source.txt').write_text('original source')
                    destination = self.existing_archive(root)
                    result = self.command(root, flags, optimization, harness.replace('KIND', repr(kind)))
                    self.assert_preserved(destination, result)

    def test_captured_payload_is_revalidated_after_a_live_guard_pass(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); path_tests.SourceArchivePathTests.checkout(root)
            source = root / 'source.txt'; source.write_text('original source')
            destination = self.existing_archive(root)
            spec = importlib.util.spec_from_file_location('captured_source_guard', ROOT / 'scripts/qa_source.py')
            guard = importlib.util.module_from_spec(spec); spec.loader.exec_module(guard)
            original = guard.scan_sources
            calls = []
            def scan(candidate_root, files):
                result = original(candidate_root, files)
                calls.append(candidate_root)
                if candidate_root == root:
                    source.write_bytes(b'changed\x00binary source')
                return result
            with patch.object(guard, 'scan_sources', side_effect=scan), \
                 patch.object(pack.zipfile, 'ZipFile') as archive:
                with self.assertRaisesRegex(pack.ArchiveBuildError, 'binary content'):
                    pack.build_source_archive(root, guard)
                archive.assert_not_called()
            self.assertEqual(len(calls), 2)
            self.assertEqual(destination.read_bytes(), b'preserve-existing-archive')

    def test_missing_tracked_source_requires_staging_an_intentional_deletion(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); path_tests.SourceArchivePathTests.checkout(root)
            source = root / 'source.txt'; source.write_text('original source'); self.commit(root); source.unlink()
            failed = self.command(root)
            self.assertNotEqual(failed.returncode, 0)
            self.assertIn('stage intentional deletions', failed.stderr)
            subprocess.run(['git', 'rm', '--cached', '--', 'source.txt'], cwd=root, check=True, capture_output=True)
            succeeded = self.command(root, ['-OO'])
            self.assertEqual(succeeded.returncode, 0, succeeded.stderr)
            with zipfile.ZipFile(root / 'production/output/game_theory_studio_public_source.zip') as archive:
                manifest = json.loads(archive.read('game-theory-studio/SOURCE_MANIFEST.json'))
                self.assertTrue(manifest['source']['working_tree_dirty'])
                self.assertFalse(manifest['source']['reproducible_from_commit'])
                self.assertNotIn('source.txt', [entry['path'] for entry in manifest['files']])

    def test_hidden_index_changes_are_published_as_dirty_snapshots_not_clean_commits(self):
        for flag in ['--assume-unchanged', '--skip-worktree']:
            with self.subTest(flag=flag), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary); path_tests.SourceArchivePathTests.checkout(root)
                source = root / 'source.txt'; source.write_text('original source'); self.commit(root)
                subprocess.run(['git', 'update-index', flag, 'source.txt'], cwd=root, check=True, capture_output=True)
                source.write_text('changed source hidden from ordinary Git status')
                self.assertEqual(subprocess.check_output(['git', 'status', '--porcelain=v1', '-z'], cwd=root), b'')
                destination = self.existing_archive(root)
                for flags, optimization in MODES:
                    result = self.command(root, flags, optimization)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    with zipfile.ZipFile(destination) as archive:
                        manifest = json.loads(archive.read('game-theory-studio/SOURCE_MANIFEST.json'))
                        self.assertTrue(manifest['source']['working_tree_dirty'])
                        self.assertFalse(manifest['source']['reproducible_from_commit'])
                        self.assertEqual(archive.read('game-theory-studio/source.txt'), source.read_bytes())
                flag_state = subprocess.check_output(['git', 'ls-files', '-v', '--', 'source.txt'], cwd=root)
                self.assertEqual(flag_state[:1], b'h' if flag == '--assume-unchanged' else b'S')

    def test_head_blob_and_membership_comparison_ignores_stale_stat_cache(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); path_tests.SourceArchivePathTests.checkout(root)
            source = root / 'source.txt'; source.write_bytes(b'AAAA'); self.commit(root)
            old_stat = source.stat(); source.write_bytes(b'BBBB')
            os.utime(source, ns=(old_stat.st_atime_ns, old_stat.st_mtime_ns))
            self.assertEqual(source.stat().st_size, old_stat.st_size)
            self.assertEqual(source.stat().st_mtime_ns, old_stat.st_mtime_ns)
            output = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root)
            payloads = pack.read_payloads(root, pack.source_candidates(root, output))
            original = pack.subprocess.check_output
            def stale_status(args, **kwargs):
                return b'' if args[:2] == ['git', 'status'] else original(args, **kwargs)
            with patch.object(pack.subprocess, 'check_output', side_effect=stale_status):
                self.assertTrue(pack.source_provenance(root, payloads)['working_tree_dirty'])
                self.assertFalse(pack.source_provenance(root, payloads)['reproducible_from_commit'])
                missing = {name: data for name, data in payloads.items() if name != 'source.txt'}
                self.assertFalse(pack.source_provenance(root, missing)['reproducible_from_commit'])
                restored = dict(payloads, **{'source.txt': b'AAAA'})
                self.assertTrue(pack.source_provenance(root, restored)['reproducible_from_commit'])

    def test_head_comparison_uses_the_recorded_object_not_replacement_refs(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); path_tests.SourceArchivePathTests.checkout(root)
            source = root / 'source.txt'; source.write_bytes(b'AAAA'); self.commit(root)
            first = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
            files = pack.source_candidates(root, subprocess.check_output(['git', 'ls-files', '-z'], cwd=root))
            original = pack.read_payloads(root, files)
            source.write_bytes(b'BBBB'); self.commit(root)
            second = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
            changed = pack.read_payloads(root, files)
            subprocess.run(['git', 'replace', first, second], cwd=root, check=True, capture_output=True)
            self.assertTrue(pack.matches_head_snapshot(root, first, original))
            self.assertFalse(pack.matches_head_snapshot(root, first, changed))

    def test_producer_commit_provenance_matches_the_verifier_sha1_contract(self):
        for identity in ['', 'g' * 40, 'a' * 64, 'a' * 39 + chr(27)]:
            result = subprocess.CompletedProcess([], 0, identity + '\n')
            with patch.object(pack.subprocess, 'run', return_value=result),                  patch.object(pack.subprocess, 'check_output', return_value=b''):
                with self.assertRaisesRegex(pack.ArchiveBuildError, 'expected SHA-1'):
                    pack.source_provenance(Path('.'), {})
        with patch.object(pack.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, 'a' * 40 + '\n')),              patch.object(pack.subprocess, 'check_output', return_value=b''), \
             patch.object(pack, 'matches_head_snapshot', return_value=True):
            provenance = pack.source_provenance(Path('.'), {})
            self.assertEqual(provenance['commit'], 'a' * 40)
            self.assertTrue(provenance['reproducible_from_commit'])

    def test_valid_clean_pack_round_trips_every_candidate_in_all_optimization_modes(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary); root = base / 'checkout'; root.mkdir()
            path_tests.SourceArchivePathTests.checkout(root)
            (root / '中文源文件.txt').write_text('synthetic original source', encoding='utf-8')
            self.commit(root)
            expected = set(subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().rstrip('\0').split('\0'))
            for index, (flags, optimization) in enumerate(MODES):
                with self.subTest(flags=flags, optimization=optimization):
                    result = self.command(root, flags, optimization)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertIn('CRC checked', result.stdout)
                    extraction = base / ('extraction-' + str(index))
                    with zipfile.ZipFile(root / 'production/output/game_theory_studio_public_source.zip') as archive:
                        manifest = json.loads(archive.read('game-theory-studio/SOURCE_MANIFEST.json'))
                        self.assertEqual({entry['path'] for entry in manifest['files']}, expected)
                        self.assertFalse(manifest['source']['working_tree_dirty'])
                        self.assertTrue(manifest['source']['reproducible_from_commit'])
                        archive.extractall(extraction)
                    verified = subprocess.run([sys.executable, '-OO', str(ROOT / 'production/verify_source_archive.py'),
                                               str(extraction / 'game-theory-studio')], capture_output=True, text=True)
                    self.assertEqual(verified.returncode, 0, verified.stderr)


if __name__ == '__main__':
    unittest.main()
