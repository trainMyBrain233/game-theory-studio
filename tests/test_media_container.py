"""Real single-threaded 6-frame files: container identity is not a filename.

Requires ffmpeg/ffprobe for integration coverage; no Canvas or private assets.
Every probe is passed unchanged to the contract under normal, -O and -OO Python.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
VALIDATE = '''
import json, sys
sys.path.insert(0, sys.argv[1])
from media_contract import validate_streams
try:
    video, audio, count = validate_streams(json.load(sys.stdin), .2)
except ValueError as error:
    print(json.dumps({'error': str(error)}))
else:
    print(json.dumps({'frames': count, 'audio_tracks': len(audio)}))
'''


@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'),
                     'Real container regression requires ffmpeg and ffprobe')
class RealMediaContainers(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.directory.cleanup)
        root = Path(cls.directory.name)
        source = root / 'source.mp4'
        cls.run_ffmpeg([
            '-filter_threads', '1', '-filter_complex_threads', '1',
            '-f', 'lavfi', '-i', 'color=c=black:s=1920x1080:r=30:d=0.2',
            '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
            '-map', '0:v:0', '-map', '1:a:0', '-t', '0.2',
            '-vf', 'setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709',
            '-c:v', 'libx264', '-threads:v', '1', '-preset', 'ultrafast',
            '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709',
            '-color_primaries', 'bt709', '-color_trc', 'bt709',
            '-c:a', 'aac', '-threads:a', '1', '-f', 'mp4', str(source)])
        cls.probes = {}
        # MP4 with a misleading extension must still pass. Other containers
        # renamed .mp4 must fail, including the shared MOV/3GP demuxer family.
        cases = [('mp4_audio', 'mp4', False, '.bin'),
                 ('mp4_silent', 'mp4', True, '.mov'),
                 ('matroska', 'matroska', False, '.mp4'),
                 ('mov', 'mov', False, '.mp4'),
                 ('3gp', '3gp', False, '.mp4')]
        for name, muxer, silent, extension in cases:
            path = root / (name + extension)
            cls.run_ffmpeg(['-i', str(source), '-map', '0:v:0',
                            *([] if silent else ['-map', '0:a:0']),
                            '-c', 'copy', '-f', muxer, str(path)])
            probe = subprocess.run(
                ['ffprobe', '-v', 'error', '-show_streams', '-show_format',
                 '-of', 'json', str(path)], capture_output=True, text=True,
                check=True, timeout=30)
            cls.probes[name] = json.loads(probe.stdout)

    @staticmethod
    def run_ffmpeg(arguments):
        run = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y',
                              '-threads', '1', *arguments],
                             capture_output=True, text=True, timeout=30)
        if run.returncode:
            raise RuntimeError(f'ffmpeg fixture failed: {run.stderr}')

    def validate_in_modes(self, info, expected):
        for flags in [[], ['-O'], ['-OO']]:
            with self.subTest(flags=flags):
                env = os.environ.copy()
                env.pop('PYTHONOPTIMIZE', None)
                result = subprocess.run(
                    [sys.executable, *flags, '-c', VALIDATE,
                     str(ROOT / 'production/qa')], input=json.dumps(info),
                    capture_output=True, text=True, env=env, timeout=30)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(json.loads(result.stdout), expected)

    def test_real_mp4_with_and_without_audio(self):
        for name, audio in [('mp4_audio', 1), ('mp4_silent', 0)]:
            with self.subTest(container=name):
                self.validate_in_modes(self.probes[name],
                                       {'frames': 6, 'audio_tracks': audio})

    def test_real_matroska_cannot_pass_as_mp4(self):
        info = self.probes['matroska']
        self.assertEqual(info['format']['format_name'], 'matroska,webm')
        self.assertEqual([s['codec_name'] for s in info['streams']], ['h264', 'aac'])
        self.validate_in_modes(info, {'error': 'Expected MP4 container'})

    def test_real_mov_and_3gp_need_major_brand_not_demuxer_alias(self):
        for name, brand in [('mov', 'qt  '), ('3gp', '3gp')]:
            with self.subTest(container=name):
                info = self.probes[name]
                self.assertIn('mp4', info['format']['format_name'].split(','))
                self.assertTrue(info['format']['tags']['major_brand'].startswith(brand))
                self.assertEqual([s['codec_name'] for s in info['streams']], ['h264', 'aac'])
                self.validate_in_modes(info, {'error': 'Expected supported MP4 major brand'})


if __name__ == '__main__':
    unittest.main()
