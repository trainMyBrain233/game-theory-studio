"""Bind probe, container, decode, and report evidence to stable encoded bytes."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
WRAPPER = r'''
import hashlib
import os
from pathlib import Path
import runpy
import shutil
import subprocess
import sys

entry, target, replacement, phase = sys.argv[1:]
target, replacement = Path(target), Path(replacement)
probe, decode, copy = subprocess.check_output, subprocess.run, shutil.copyfileobj
snapshot = None

def replace_input():
    if phase == 'in-place':
        target.write_bytes(replacement.read_bytes())
    else:
        os.replace(replacement, target)

def checked_probe(command, **kwargs):
    global snapshot
    snapshot = Path(command[-1])
    result = probe(command, **kwargs)
    if phase in ('probe', 'in-place'):
        replace_input()
    return result

def checked_decode(command, **kwargs):
    if command[0] != 'ffmpeg':
        return decode(command, **kwargs)
    input_path = Path(command[command.index('-i') + 1])
    print('DECODE_SHA=' + hashlib.sha256(input_path.read_bytes()).hexdigest())
    result = decode(command, **kwargs)
    if phase == 'decode':
        replace_input()
    return result

def checked_copy(source, destination, **kwargs):
    result = copy(source, destination, **kwargs)
    if phase == 'copy':
        target.write_bytes(replacement.read_bytes())
    return result

subprocess.check_output = checked_probe
subprocess.run = checked_decode
shutil.copyfileobj = checked_copy
sys.path.insert(0, str(Path(entry).parent))
sys.argv = [entry, str(target), '--duration', '.1', '--width', '1920']
try:
    runpy.run_path(entry, run_name='__main__')
finally:
    if snapshot is not None:
        print('SNAPSHOT_EXISTS=' + str(snapshot.exists()))
'''


@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'),
                     'Requires real ffmpeg and ffprobe')
class MediaSnapshot(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.directory.cleanup)
        cls.root = Path(cls.directory.name)
        cls.qa = cls.root / 'production/qa'
        cls.qa.mkdir(parents=True)
        for name in ('verify_media.py', 'media_contract.py'):
            shutil.copyfile(ROOT / 'production/qa' / name, cls.qa / name)
        (cls.qa.parent / 'tokens.json').write_text('{"encoding":{"faststart":true}}')
        timeline = cls.root / 'chapters/01-four-elements/narration/timeline.json'
        timeline.parent.mkdir(parents=True)
        timeline.write_text('{"duration":0.1}')
        cls.sources = []
        cls.frame_hashes = []
        for color in ('black', 'red'):
            path = cls.root / f'{color}.mp4'
            run = subprocess.run([
                'ffmpeg', '-nostdin', '-v', 'error', '-y', '-filter_threads', '1',
                '-f', 'lavfi', '-i', f'color=c={color}:s=1920x1080:r=30:d=0.1',
                '-vf', 'setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709',
                '-c:v', 'libx264', '-threads:v', '1', '-preset', 'ultrafast',
                '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709',
                '-color_primaries', 'bt709', '-color_trc', 'bt709',
                '-movflags', '+faststart', str(path)],
                capture_output=True, text=True, timeout=30)
            if run.returncode:
                raise RuntimeError(run.stderr)
            cls.sources.append(path.read_bytes())
            cls.frame_hashes.append(subprocess.check_output([
                'ffmpeg', '-v', 'error', '-i', str(path), '-threads:v', '1',
                '-f', 'framemd5', '-'], timeout=30))

    def test_same_contract_different_pixels_are_not_interchangeable(self):
        self.assertNotEqual(self.sources[0], self.sources[1])
        self.assertNotEqual(self.frame_hashes[0], self.frame_hashes[1])
        for color in ('black', 'red'):
            path = self.root / f'{color}.mp4'
            result = subprocess.run([sys.executable, str(self.qa / 'verify_media.py'),
                                     str(path), '--duration', '.1', '--width', '1920'],
                                    capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads((self.qa / f'media_{color}.mp4.json').read_text())
            self.assertEqual(report['full_decode']['frames'], 3)
            self.assertEqual(report['video']['width'], 1920)
            self.assertEqual(report['sha256'], hashlib.sha256(path.read_bytes()).hexdigest())

    def test_replacements_and_writes_fail_closed_with_stable_decode_bytes(self):
        target, replacement = self.root / 'episode.mp4', self.root / 'replacement.mp4'
        report = self.qa / 'media_episode.mp4.json'
        original_sha = hashlib.sha256(self.sources[0]).hexdigest()
        env = {key: value for key, value in os.environ.items() if key != 'PYTHONOPTIMIZE'}
        for phase in ('copy', 'probe', 'decode', 'in-place'):
            for flags in ([], ['-O'], ['-OO']):
                for existing in (False, True):
                    with self.subTest(phase=phase, flags=flags, existing=existing):
                        target.write_bytes(self.sources[0])
                        replacement.write_bytes(self.sources[1])
                        report.unlink(missing_ok=True)
                        if existing:
                            report.write_bytes(b'previous verified report')
                        result = subprocess.run([
                            sys.executable, *flags, '-c', WRAPPER,
                            str(self.qa / 'verify_media.py'), str(target),
                            str(replacement), phase], env=env,
                            capture_output=True, text=True, timeout=30)
                        self.assertNotEqual(result.returncode, 0, result.stdout)
                        self.assertIn('Media input changed during', result.stderr)
                        self.assertNotIn('encoding contract passed', result.stdout)
                        self.assertEqual(target.read_bytes(), self.sources[1])
                        if phase != 'copy':
                            self.assertIn('DECODE_SHA=' + original_sha, result.stdout)
                            self.assertIn('SNAPSHOT_EXISTS=False', result.stdout)
                        else:
                            self.assertNotIn('DECODE_SHA=', result.stdout)
                        if existing:
                            self.assertEqual(report.read_bytes(), b'previous verified report')
                        else:
                            self.assertFalse(report.exists())


if __name__ == '__main__':
    unittest.main()
