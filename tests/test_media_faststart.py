"""Faststart means a top-level moov before every mdat, verified from file bytes."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'production/qa'))
from media_contract import validate_faststart
import verify_media


def box(kind, payload=b'', large=False):
    if large:
        return struct.pack('>I4sQ', 1, kind, 16 + len(payload)) + payload
    return struct.pack('>I4s', 8 + len(payload), kind) + payload


class BoxFixtures(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / 'fixture.mp4'

    def test_regular_large_zero_and_payload_markers(self):
        for large in (False, True):
            head = (box(b'ftyp', b'isom') + box(b'free', b'mdatmoov', large)
                    + box(b'uuid', b'0123456789abcdef', large))
            moov = box(b'moov', b'mdat', large)
            for media in (box(b'mdat', b'moov', large), b'\0\0\0\0mdatpayload'):
                with self.subTest(large=large, media=media):
                    self.path.write_bytes(head + moov + media)
                    self.assertEqual(validate_faststart(self.path), {
                        'moov_offset': len(head), 'first_mdat_offset': len(head + moov)})

    def test_malformed_inputs_and_late_moov_preserve_report(self):
        moov, mdat = box(b'moov'), box(b'mdat')
        cases = [b'', b'1234567', moov, mdat, mdat + moov,
                 box(b'free', moov) + mdat, moov + box(b'free', mdat),
                 moov + mdat + b'x', moov + moov + mdat,
                 b'\0\0\0\0mdat' + moov, b'\0\0\0\0free' + moov + mdat,
                 struct.pack('>I4s', 7, b'free') + moov + mdat,
                 struct.pack('>I4s', 1000, b'free') + moov + mdat,
                 struct.pack('>I4s', 1, b'free') + b'123',
                 struct.pack('>I4sQ', 1, b'free', 15) + moov + mdat,
                 struct.pack('>I4sQ', 1, b'free', 2**64 - 1) + moov + mdat,
                 box(b'uuid') + moov + mdat,
                 moov + mdat + box(b'free') * 100000]
        root = Path(self.directory.name)
        production = root / 'production'
        (production / 'qa').mkdir(parents=True)
        (production / 'tokens.json').write_text('{"encoding":{"faststart":true}}')
        timeline = root / 'chapters/01-four-elements/narration/timeline.json'
        timeline.parent.mkdir(parents=True)
        timeline.write_text('{"duration":1}')
        report = production / 'qa/media_fixture.mp4.json'
        # Simulate only metadata; the real byte parser must reject before decode/hash.
        with patch.object(verify_media.shutil, 'which', return_value='/fixture/tool'), \
             patch.object(verify_media.subprocess, 'check_output', return_value=b'{}'), \
             patch.object(verify_media, 'validate_streams', return_value=({}, [], 30)), \
             patch.object(verify_media.subprocess, 'run') as decode, \
             patch.object(verify_media, 'sha256_file') as digest:
            for data in cases:
                for existing in (False, True):
                    with self.subTest(length=len(data), prefix=data[:24], existing=existing):
                        report.unlink(missing_ok=True)
                        if existing:
                            report.write_bytes(b'previous verified report')
                        self.path.write_bytes(data)
                        with self.assertRaises(ValueError):
                            verify_media.main([str(self.path)], production)
                        decode.assert_not_called()
                        digest.assert_not_called()
                        if existing:
                            self.assertEqual(report.read_bytes(), b'previous verified report')
                        else:
                            self.assertFalse(report.exists())

    def test_sparse_large_payload_has_bounded_header_reads(self):
        length = 8 * 1024**3
        with self.path.open('wb') as stream:
            stream.write(box(b'moov'))
            stream.write(struct.pack('>I4sQ', 1, b'mdat', length - 8))
            stream.truncate(length)
        original_open = Path.open
        sizes = []
        class BoundedReader:
            def __enter__(inner):
                inner.stream = original_open(self.path, 'rb')
                return inner
            def __exit__(inner, *args):
                inner.stream.close()
            def fileno(inner):
                return inner.stream.fileno()
            def seek(inner, position):
                return inner.stream.seek(position)
            def read(inner, size=-1):
                if not 0 < size <= 8:
                    raise RuntimeError('Unbounded box header read')
                sizes.append(size)
                return inner.stream.read(size)
        with patch.object(Path, 'open', return_value=BoundedReader()):
            self.assertEqual(validate_faststart(self.path), {'moov_offset': 0, 'first_mdat_offset': 8})
        self.assertEqual(sizes, [8, 8, 8])


class OptimizationModes(unittest.TestCase):
    def test_parser_and_report_failures_in_all_modes(self):
        for flags in ([], ['-O'], ['-OO']):
            with self.subTest(flags=flags):
                env = {k: v for k, v in os.environ.items() if k != 'PYTHONOPTIMIZE'}
                run = subprocess.run([sys.executable, *flags, str(Path(__file__).resolve()),
                                      'BoxFixtures'], capture_output=True, text=True,
                                     env=env, timeout=30)
                self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
                self.assertIn('Ran 3 tests', run.stderr)


@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'Requires real FFmpeg')
class RealFaststart(unittest.TestCase):
    def test_real_ffmpeg_faststart_on_off_cli_in_all_modes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            qa = root / 'production/qa'
            qa.mkdir(parents=True)
            for name in ('media_contract.py', 'verify_media.py'):
                shutil.copyfile(ROOT / 'production/qa' / name, qa / name)
            tokens = qa.parent / 'tokens.json'
            timeline = root / 'chapters/01-four-elements/narration/timeline.json'
            timeline.parent.mkdir(parents=True)
            timeline.write_text('{"duration":1}')
            for faststart in (False, True):
                media = root / ('fast.mp4' if faststart else 'late.mp4')
                encode = subprocess.run([
                    'ffmpeg', '-nostdin', '-v', 'error', '-y', '-filter_threads', '1',
                    '-f', 'lavfi', '-i', 'color=c=black:s=1920x1080:r=30:d=0.2',
                    '-vf', 'setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709',
                    '-c:v', 'libx264', '-threads:v', '1', '-preset', 'ultrafast',
                    '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709',
                    '-color_primaries', 'bt709', '-color_trc', 'bt709',
                    *(['-movflags', '+faststart'] if faststart else []), str(media)],
                    capture_output=True, text=True, timeout=30)
                self.assertEqual(encode.returncode, 0, encode.stderr)
                report = qa / ('media_' + media.name + '.json')
                for required in (False, True):
                    tokens.write_text(json.dumps({'encoding': {'faststart': required}}))
                    for flags in ([], ['-O'], ['-OO']):
                        with self.subTest(encoded_faststart=faststart, required=required, flags=flags):
                            report.write_bytes(b'previous report')
                            env = {k: v for k, v in os.environ.items() if k != 'PYTHONOPTIMIZE'}
                            run = subprocess.run([
                                sys.executable, *flags, str(qa / 'verify_media.py'),
                                str(media), '--duration', '.2'], env=env,
                                capture_output=True, text=True, timeout=30)
                            if required and not faststart:
                                self.assertNotEqual(run.returncode, 0)
                                self.assertIn('moov must precede mdat', run.stderr)
                                self.assertNotIn('encoding contract passed', run.stdout)
                                self.assertEqual(report.read_bytes(), b'previous report')
                            else:
                                self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
                                actual = json.loads(report.read_text())
                                self.assertEqual(actual['sha256'], hashlib.sha256(media.read_bytes()).hexdigest())
                                self.assertEqual(actual['full_decode']['frames'], 6)
                                self.assertEqual(actual['full_decode']['status'], 'passed')
                                self.assertEqual(actual['faststart']['required'], required)
                                if required:
                                    layout = actual['faststart']['layout']
                                    self.assertLess(layout['moov_offset'], layout['first_mdat_offset'])
                                else:
                                    self.assertIsNone(actual['faststart']['layout'])


if __name__ == '__main__':
    unittest.main()
