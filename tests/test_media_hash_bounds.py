"""Exercise streaming SHA through verify_media's CLI, without decoding a long film.

Only ffprobe/ffmpeg are simulated in bounded-reader tests; the real container,
stream, duration and decoded-frame checks and report publication run unchanged.
"""
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
LIMIT = 1024 * 1024
MODES = [[], ['-O'], ['-OO']]
WRAPPER = r'''
import json
from pathlib import Path
import runpy
import shutil
import subprocess
import sys
from types import SimpleNamespace

entry, mode = sys.argv[1:]
target = Path('episode.mp4').resolve()
original_open = Path.open
reads = consumed = opens = probes = decodes = 0
limit = 1024 * 1024

class BoundedStream:
    def __init__(self, stream):
        self.stream = stream
    def __enter__(self):
        return self
    def __exit__(self, *args):
        self.stream.close()
    def read(self, size=-1):
        global reads, consumed
        if not 0 < size <= limit:
            raise RuntimeError('fixture rejected unbounded media read')
        reads += 1
        if mode == 'read-error' and reads == 4:
            raise OSError('fixture media read failed')
        # A short read is not EOF; force irregular chunks in the positive case.
        data = self.stream.read(min(size, 65537) if mode == 'short-read' else size)
        consumed += len(data)
        return data

def checked_open(path, *args, **kwargs):
    global opens
    if path.resolve() != target:
        return original_open(path, *args, **kwargs)
    opens += 1
    return BoundedStream(original_open(path, *args, **kwargs))

def probe(command, **kwargs):
    global probes
    probes += 1
    if command != ['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(target)]:
        raise RuntimeError('fixture unexpected probe command')
    info = {'format': {'duration': '1.0', 'format_name': 'mov,mp4,m4a,3gp,3g2,mj2',
                      'tags': {'major_brand': 'isom'}},
            'streams': [dict(codec_type='video', codec_name='h264', r_frame_rate='30/1',
                             avg_frame_rate='30/1', nb_frames='30', width=1920, height=1080,
                             pix_fmt='yuv420p', sample_aspect_ratio='1:1', color_range='tv',
                             color_space='bt709', color_primaries='bt709', color_transfer='bt709',
                             start_time='0.0', duration='1.0')]}
    if mode == 'container-error':
        info['format']['format_name'] = 'matroska,webm'
    if mode == 'stream-error':
        info['streams'].append({'codec_type': 'subtitle'})
    return json.dumps(info).encode()

def decode(command, **kwargs):
    global decodes
    decodes += 1
    if command != ['ffmpeg', '-v', 'error', '-i', str(target), '-progress', 'pipe:1', '-f', 'null', '-']:
        raise RuntimeError('fixture unexpected decode command')
    return SimpleNamespace(returncode=1 if mode == 'decode-error' else 0,
                           stderr='corrupt input' if mode == 'decode-stderr' else '',
                           stdout='frame=1\nframe=29\n' if mode == 'frame-error' else 'frame=1\nframe=30\n')

Path.open = checked_open
shutil.which = lambda tool: '/fixture/' + tool
subprocess.check_output = probe
subprocess.run = decode
sys.path.insert(0, str(Path(entry).parent))
sys.argv = [entry, str(target), '--duration', '1']
try:
    runpy.run_path(entry, run_name='__main__')
finally:
    print(f'ACCESS opens={opens} reads={reads} bytes={consumed} probes={probes} decodes={decodes}')
'''


class MediaHashBounds(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.qa = self.root / 'production/qa'
        self.qa.mkdir(parents=True)
        for name in ['verify_media.py', 'media_contract.py']:
            shutil.copyfile(ROOT / 'production/qa' / name, self.qa / name)
        timeline = self.root / 'chapters/01-four-elements/narration/timeline.json'
        timeline.parent.mkdir(parents=True)
        timeline.write_text('{"duration": 1}', encoding='utf-8')
        self.media = self.root / 'episode.mp4'
        self.report = self.qa / 'media_episode.mp4.json'

    def run_main(self, mode, flags):
        env = {key: value for key, value in os.environ.items() if key != 'PYTHONOPTIMIZE'}
        env['PYTHONDONTWRITEBYTECODE'] = '1'
        return subprocess.run([sys.executable, *flags, '-c', WRAPPER,
                               str(self.qa / 'verify_media.py'), mode],
                              cwd=self.root, env=env, capture_output=True, text=True, timeout=20)

    def test_known_sha_through_main_and_short_reads_hash_every_byte(self):
        cases = [(b'abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'normal'),
                 (b'a' * 1000000, 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0', 'short-read')]
        # Multiple full 1 MiB chunks and a partial final chunk, with a varying pattern.
        data = bytes(range(256)) * 12289 + b'end'
        cases.append((data, hashlib.sha256(data).hexdigest(), 'normal'))
        for data, expected, mode in cases:
            self.media.write_bytes(data)
            for flags in MODES:
                with self.subTest(size=len(data), mode=mode, flags=flags):
                    self.report.unlink(missing_ok=True)
                    result = self.run_main(mode, flags)
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    report = json.loads(self.report.read_text(encoding='utf-8'))
                    self.assertEqual(report['sha256'], expected)
                    self.assertEqual(report['bytes'], len(data))
                    self.assertEqual(report['full_decode']['status'], 'passed')
                    self.assertEqual(report['full_decode']['frames'], 30)
                    self.assertEqual(report['audio_tracks'], 0)
                    size = 65537 if mode == 'short-read' else LIMIT
                    reads = (len(data) + size - 1) // size + 1
                    self.assertIn(f'ACCESS opens=1 reads={reads} bytes={len(data)} probes=1 decodes=1', result.stdout)

    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'),
                         'Real CLI smoke requires ffmpeg and ffprobe')
    def test_real_six_frame_mp4_cli_reports_actual_sha(self):
        encoded = subprocess.run([
            'ffmpeg', '-nostdin', '-v', 'error', '-y', '-filter_threads', '1',
            '-f', 'lavfi', '-i', 'color=c=black:s=1920x1080:r=30:d=0.2',
            '-vf', 'setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709',
            '-c:v', 'libx264', '-threads:v', '1', '-preset', 'ultrafast',
            '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709',
            '-color_primaries', 'bt709', '-color_trc', 'bt709', str(self.media)],
            capture_output=True, text=True, timeout=30)
        self.assertEqual(encoded.returncode, 0, encoded.stderr)
        # This read is only the tiny six-frame fixture, never a production film.
        self.assertLess(self.media.stat().st_size, LIMIT)
        expected = hashlib.sha256(self.media.read_bytes()).hexdigest()
        env = {key: value for key, value in os.environ.items() if key != 'PYTHONOPTIMIZE'}
        env['PYTHONDONTWRITEBYTECODE'] = '1'
        for flags in MODES:
            with self.subTest(flags=flags):
                self.report.unlink(missing_ok=True)
                result = subprocess.run([
                    sys.executable, *flags, str(self.qa / 'verify_media.py'),
                    str(self.media), '--duration', '0.2'],
                    cwd=self.root, env=env, capture_output=True, text=True, timeout=30)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                report = json.loads(self.report.read_text(encoding='utf-8'))
                self.assertEqual(report['sha256'], expected)
                self.assertEqual(report['full_decode']['frames'], 6)
                self.assertEqual(report['full_decode']['status'], 'passed')
                self.assertEqual(report['expected_duration'], 0.2)

    def test_sparse_file_read_failure_does_not_publish_success(self):
        with self.media.open('wb') as stream:
            stream.truncate(8 * 1024 * 1024 * 1024)
        for flags in MODES:
            for existing in [False, True]:
                with self.subTest(flags=flags, existing=existing):
                    self.report.unlink(missing_ok=True)
                    if existing:
                        self.report.write_text('previous report', encoding='utf-8')
                    result = self.run_main('read-error', flags)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn('fixture media read failed', result.stderr)
                    self.assertIn(f'ACCESS opens=1 reads=4 bytes={3 * LIMIT} probes=1 decodes=1', result.stdout)
                    self.assertNotIn('encoding contract passed', result.stdout)
                    if existing:
                        self.assertEqual(self.report.read_text(encoding='utf-8'), 'previous report')
                    else:
                        self.assertFalse(self.report.exists())

    def test_container_stream_and_full_decode_failures_precede_hash_and_report(self):
        self.media.write_bytes(b'abc')
        for mode, message, decodes in [
                ('container-error', 'Expected MP4 container', 0),
                ('stream-error', 'only video or audio', 0),
                ('decode-error', 'Full decode failed', 1),
                ('decode-stderr', 'Full decode failed', 1),
                ('frame-error', 'Decoded frame count mismatch', 1)]:
            for flags in MODES:
                with self.subTest(mode=mode, flags=flags):
                    result = self.run_main(mode, flags)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn(message, result.stderr)
                    self.assertIn(f'ACCESS opens=0 reads=0 bytes=0 probes=1 decodes={decodes}', result.stdout)
                    self.assertFalse(self.report.exists())
                    self.assertNotIn('encoding contract passed', result.stdout)

    def test_previous_read_bytes_implementation_is_rejected_before_allocation(self):
        entry = self.qa / 'verify_media.py'
        source = entry.read_text(encoding='utf-8')
        needle = "'sha256':sha256_file(path)"
        self.assertIn(needle, source)
        entry.write_text(source.replace(needle, "'sha256':hashlib.sha256(path.read_bytes()).hexdigest()"), encoding='utf-8')
        with self.media.open('wb') as stream:
            stream.truncate(8 * 1024 * 1024 * 1024)
        for flags in MODES:
            with self.subTest(flags=flags):
                result = self.run_main('normal', flags)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('fixture rejected unbounded media read', result.stderr)
                self.assertIn('ACCESS opens=1 reads=0 bytes=0 probes=1 decodes=1', result.stdout)
                self.assertFalse(self.report.exists())


if __name__ == '__main__':
    unittest.main()
