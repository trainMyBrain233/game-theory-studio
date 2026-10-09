"""SFX publication uses temporary products; no tracked audio/QA output is touched."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch
import wave

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'production'))
sys.path.insert(0, str(ROOT / 'scripts'))
import make_sound
import narration_io

WAV = Path('output/original_sparse_sfx.wav')
MANIFEST = Path('qa/sound_manifest.json')
PCM = struct.pack('<hhhh', -32768, 32767, 0, 42)
METADATA = {'source': 'original synthesis in make_sound.py', 'sample_rate': 48000}


def snapshot(root):
    result = {}
    for path in root.rglob('*'):
        name = str(path.relative_to(root))
        if path.is_symlink():
            result[name] = ('symlink', os.readlink(path))
        elif path.is_dir():
            result[name] = ('directory',)
        elif path.is_file():
            result[name] = path.read_bytes()
        else:
            result[name] = ('special', path.lstat().st_mode)
    return result


def seed(root):
    for relative in (WAV, MANIFEST):
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(('old ' + str(relative)).encode())
    (root / 'keep.txt').write_bytes(b'user-owned')


class SoundPublicationTests(unittest.TestCase):
    def publish(self, root):
        make_sound.publish_sound(root, PCM, METADATA)

    def test_success_matches_wave_file_writer_and_is_reproducible(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            seed(root)
            expected = root / 'expected.wav'
            with wave.open(str(expected), 'wb') as audio:
                audio.setnchannels(2)
                audio.setsampwidth(2)
                audio.setframerate(48000)
                audio.writeframes(PCM)
            expected_bytes = expected.read_bytes()
            expected.unlink()
            self.publish(root)
            self.assertEqual((root / WAV).read_bytes(), expected_bytes)
            self.assertEqual((root / MANIFEST).read_bytes(), json.dumps(METADATA, indent=2).encode('utf-8'))
            first = snapshot(root)
            self.publish(root)
            self.assertEqual(snapshot(root), first)
            self.assertEqual((root / 'keep.txt').read_bytes(), b'user-owned')

    def test_directory_and_fifo_destinations_fail_before_publication(self):
        kinds = ['directory'] + (['fifo'] if hasattr(os, 'mkfifo') else [])
        for relative in (WAV, MANIFEST):
            for kind in kinds:
                with self.subTest(relative=relative, kind=kind), tempfile.TemporaryDirectory() as directory:
                    root = Path(directory)
                    seed(root)
                    target = root / relative
                    target.unlink()
                    if kind == 'directory':
                        target.mkdir()
                        (target / 'keep').write_bytes(b'keep')
                    else:
                        os.mkfifo(target)
                    before = snapshot(root)
                    with patch.object(narration_io.os, 'replace') as replace:
                        with self.assertRaisesRegex(ValueError, 'regular file'):
                            self.publish(root)
                        replace.assert_not_called()
                    self.assertEqual(snapshot(root), before)

    def test_symlink_products_and_parents_are_not_followed(self):
        for relative in (WAV, MANIFEST, WAV.parent, MANIFEST.parent):
            with self.subTest(relative=relative), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                seed(root)
                target = root / relative
                outside = root / 'outside'
                if target.is_dir():
                    target.rename(outside)
                    target.symlink_to(outside, target_is_directory=True)
                else:
                    target.rename(outside)
                    target.symlink_to(outside)
                before = snapshot(root)
                with self.assertRaisesRegex(ValueError, 'symbolic links'):
                    self.publish(root)
                self.assertEqual(snapshot(root), before)

    def test_unwritable_second_parent_preflight_preserves_both_products(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            seed(root)
            before = snapshot(root)
            real_probe = narration_io.tempfile.TemporaryFile
            def probe(*args, **kwargs):
                if Path(kwargs['dir']) == root / 'qa':
                    raise PermissionError('injected unwritable manifest parent')
                return real_probe(*args, **kwargs)
            with patch.object(narration_io.tempfile, 'TemporaryFile', side_effect=probe):
                with patch.object(narration_io.os, 'replace') as replace:
                    with self.assertRaisesRegex(PermissionError, 'unwritable manifest parent'):
                        self.publish(root)
                    replace.assert_not_called()
            self.assertEqual(snapshot(root), before)

    @unittest.skipIf(os.name != 'posix' or os.geteuid() == 0, 'requires POSIX permission enforcement')
    def test_real_unwritable_second_parent(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            seed(root)
            before = snapshot(root)
            (root / 'qa').chmod(0o555)
            try:
                with self.assertRaises(PermissionError):
                    self.publish(root)
                self.assertEqual(snapshot(root), before)
            finally:
                (root / 'qa').chmod(0o755)

    def test_second_replace_failure_restores_existing_and_removes_new_outputs(self):
        for existing in (False, True):
            with self.subTest(existing=existing), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                if existing:
                    seed(root)
                before = snapshot(root)
                real_replace = os.replace
                calls = []
                def replace(source, target):
                    calls.append(Path(target).relative_to(root))
                    if len(calls) == 2:
                        raise PermissionError('injected second publish failure')
                    return real_replace(source, target)
                with patch.object(narration_io.os, 'replace', side_effect=replace):
                    with self.assertRaisesRegex(PermissionError, 'second publish failure'):
                        self.publish(root)
                self.assertEqual(calls[:2], [WAV, MANIFEST])
                self.assertEqual(snapshot(root), before)

    def test_failed_byte_staging_preserves_outputs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            seed(root)
            before = snapshot(root)
            with patch.object(Path, 'write_bytes', side_effect=OSError('injected full disk')):
                with self.assertRaisesRegex(OSError, 'full disk'):
                    self.publish(root)
            self.assertEqual(snapshot(root), before)

    @unittest.skipUnless(importlib.util.find_spec('numpy'), 'optional NumPy synthesis dependency is not installed')
    def test_actual_main_reproduces_current_timeline_and_rolls_back(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            timeline = root / 'chapters/01-four-elements/narration/timeline.json'
            timeline.parent.mkdir(parents=True)
            timeline.write_bytes((ROOT / 'chapters/01-four-elements/narration/timeline.json').read_bytes())
            production = root / 'production'
            with patch.object(make_sound, 'ROOT', production), contextlib.redirect_stdout(io.StringIO()):
                make_sound.main()
                first = snapshot(production)
                make_sound.main()
                self.assertEqual(snapshot(production), first)
                with wave.open(str(production / WAV), 'rb') as audio:
                    self.assertEqual((audio.getnchannels(), audio.getsampwidth(), audio.getframerate()), (2, 2, 48000))
                    self.assertEqual(audio.getnframes(), round(json.loads(timeline.read_text())['duration'] * 48000))
                seed(production)
                before = snapshot(production)
                real_replace = os.replace
                calls = []
                def replace(source, target):
                    calls.append(target)
                    if len(calls) == 2:
                        raise PermissionError('actual main second publish failure')
                    return real_replace(source, target)
                with patch.object(narration_io.os, 'replace', side_effect=replace):
                    with self.assertRaisesRegex(PermissionError, 'actual main second publish failure'):
                        make_sound.main()
                self.assertEqual(snapshot(production), before)


if __name__ == '__main__':
    unittest.main()
