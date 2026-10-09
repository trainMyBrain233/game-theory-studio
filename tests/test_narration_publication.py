"""Exercise real builders and publication failures without touching tracked products."""
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import test_narration_validation as validation

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import narration_io

SOURCES = [validation.EPISODE, validation.ORIGINAL, 'templates/chapter/build_narration.py']
FAILURE = '''
_real_replace = os.replace
_replace_count = 0
def _fail_late(source, target):
    global _replace_count
    _replace_count += 1
    if _replace_count == 2:
        print('INJECTED_LATE_PUBLICATION_FAILURE_AFTER_FIRST_REPLACE', file=__import__('sys').stderr)
        raise PermissionError('injected late publication failure')
    return _real_replace(source, target)
os.replace = _fail_late
'''


def snapshot(root):
    return {str(p.relative_to(root)): ('directory' if p.is_dir() else p.read_bytes())
            for p in root.rglob('*')}


class NarrationPublicationTests(unittest.TestCase):
    def test_real_builders_directory_preflight_and_late_failure_then_rebuild(self):
        helper = validation.NarrationValidationTests()
        for source in SOURCES:
            for mode in validation.MODES:
                for existing in (False, True):
                    with self.subTest(source=source, mode=mode, existing=existing), tempfile.TemporaryDirectory() as temporary:
                        root = Path(temporary)
                        builder = helper.fixture(root, source)
                        output = root / 'output'
                        expected_dir = root / 'expected'
                        valid = helper.run_builder(builder, mode, expected_dir)
                        self.assertEqual(valid.returncode, 0, valid.stderr)
                        expected = snapshot(expected_dir)
                        if existing:
                            output.mkdir()
                            for name in expected:
                                target = output / name
                                if expected[name] == 'directory':
                                    target.mkdir(parents=True, exist_ok=True)
                                else:
                                    target.parent.mkdir(parents=True, exist_ok=True)
                                    target.write_bytes(('old bytes ' + name).encode())
                            (output / 'user-file.txt').write_bytes(b'keep me')
                        before = snapshot(output) if output.exists() else None
                        io_path = root / 'scripts/narration_io.py'
                        good = io_path.read_text(encoding='utf-8')
                        io_path.write_text(good + FAILURE, encoding='utf-8')
                        failed = helper.run_builder(builder, mode, output)
                        self.assertNotEqual(failed.returncode, 0)
                        self.assertIn('INJECTED_LATE_PUBLICATION_FAILURE_AFTER_FIRST_REPLACE', failed.stderr)
                        self.assertIn('PermissionError: injected late publication failure', failed.stderr)
                        self.assertEqual(snapshot(output) if output.exists() else None, before)
                        io_path.write_text(good, encoding='utf-8')
                        rebuilt = helper.run_builder(builder, mode, output)
                        self.assertEqual(rebuilt.returncode, 0, rebuilt.stderr)
                        actual = snapshot(output)
                        if existing:
                            self.assertEqual(actual.pop('user-file.txt'), b'keep me')
                        self.assertEqual(actual, expected)
                        # A real late SRT directory conflict is found before timeline
                        # replacement. Keep a child to prove user-owned dirs survive.
                        (output / 'game_theory_v2_zh.srt').unlink()
                        (output / 'game_theory_v2_zh.srt').mkdir()
                        (output / 'game_theory_v2_zh.srt/keep').write_bytes(b'user-owned')
                        (output / 'timeline.json').write_bytes(b'timeline sentinel')
                        before = snapshot(output)
                        failed = helper.run_builder(builder, mode, output)
                        self.assertNotEqual(failed.returncode, 0)
                        self.assertIn('Output product must be a regular file', failed.stderr)
                        self.assertEqual(snapshot(output), before)

    @unittest.skipIf(os.name != 'posix' or os.geteuid() == 0, 'requires real POSIX permission enforcement')
    def test_real_builders_unwritable_late_parent_preflight(self):
        helper = validation.NarrationValidationTests()
        for source in SOURCES:
            for mode in validation.MODES:
                with self.subTest(source=source, mode=mode), tempfile.TemporaryDirectory() as temporary:
                    root = Path(temporary)
                    builder = helper.fixture(root, source)
                    text = builder.read_text(encoding='utf-8')
                    self.assertIn("'game_theory_v2_zh.srt':", text)
                    builder.write_text(text.replace("'game_theory_v2_zh.srt':", "'locked/game_theory_v2_zh.srt':"), encoding='utf-8')
                    output = root / 'output'
                    locked = output / 'locked'
                    locked.mkdir(parents=True)
                    (output / 'timeline.json').write_bytes(b'original timeline')
                    (locked / 'game_theory_v2_zh.srt').write_bytes(b'original subtitles')
                    before = snapshot(output)
                    locked.chmod(0o555)
                    try:
                        result = helper.run_builder(builder, mode, output)
                        self.assertNotEqual(result.returncode, 0)
                        self.assertIn('PermissionError:', result.stderr)
                        self.assertIn('locked', result.stderr)
                        self.assertEqual(snapshot(output), before)
                    finally:
                        locked.chmod(0o755)

    def test_staging_failure_removes_new_directories(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / 'new' / 'output'
            with self.assertRaises(TypeError):
                narration_io.write_products(output, {'a': 'valid', 'nested/b': None})
            self.assertEqual(snapshot(Path(temporary)), {})

    def test_mixed_existing_new_outputs_rollback(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'old').write_bytes(b'old bytes')
            (root / 'untouched').mkdir()
            before = snapshot(root)
            real = os.replace
            calls = []
            def replace(source, target):
                calls.append(Path(target).name)
                if len(calls) == 3:
                    raise PermissionError('late third failure')
                return real(source, target)
            with patch.object(narration_io.os, 'replace', side_effect=replace):
                with self.assertRaisesRegex(PermissionError, 'late third failure'):
                    narration_io.write_products(root, {'old': 'changed', 'nested/new': 'new', 'third': 'third'})
            self.assertEqual(calls[:3], ['old', 'new', 'third'])
            self.assertEqual(snapshot(root), before)

    def test_rollback_failure_preserves_backup_and_reports_recovery(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'old').write_bytes(b'original')
            real = os.replace
            calls = []
            def replace(source, target):
                calls.append(str(target))
                if len(calls) > 1:
                    raise PermissionError('device unavailable')
                return real(source, target)
            with patch.object(narration_io.os, 'replace', side_effect=replace):
                with self.assertRaisesRegex(RuntimeError, 'rollback was incomplete; recovery files retained'):
                    narration_io.write_products(root, {'old': 'changed', 'second': 'new'})
            backups = list(root.glob('.narration-*/old/old'))
            self.assertEqual(len(backups), 1)
            self.assertEqual(backups[0].read_bytes(), b'original')

    def test_path_conflicts_and_symlinks_do_not_modify_user_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for products in ({'../escape': 'bad'}, {'': 'bad'}, {'a': 'a', './a': 'b'}, {'a': 'a', 'a/b': 'b'}):
                with self.assertRaises(ValueError):
                    narration_io.write_products(root / 'out', products)
                self.assertEqual(snapshot(root), {})
            outside = root / 'outside'
            outside.mkdir()
            (outside / 'keep').write_bytes(b'keep')
            out = root / 'out'
            out.mkdir()
            (out / 'link').symlink_to(outside, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, 'symbolic links'):
                narration_io.write_products(out, {'early': 'new', 'link/keep': 'bad'})
            self.assertEqual((outside / 'keep').read_bytes(), b'keep')
            self.assertFalse((out / 'early').exists())


if __name__ == '__main__':
    unittest.main()
