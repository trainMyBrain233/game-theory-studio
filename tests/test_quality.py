"""Negative fixtures for publication boundaries, UTF-8 I/O and font recovery."""
from pathlib import Path
import hashlib
from contextlib import redirect_stdout, redirect_stderr
import io
import os
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from narration_io import write_products
from qa_source import scan_sources
from case_data import spoken_number
import setup_fonts


class PublicationTests(unittest.TestCase):
    def scan(self, name, data):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / name).write_bytes(data)
            return scan_sources(root, [name])[0]

    def test_original_svg_allowed(self):
        self.assertFalse(self.scan('source.svg', b'<svg><path d="M0 0 L10 10"/></svg>'))

    def test_embedded_raster_not_misrepresented_as_vector(self):
        self.assertTrue(self.scan('source.svg', b'<svg><image href="data:image/png;base64,AA=="/></svg>'))

    def test_script_svg_rejected(self):
        self.assertTrue(self.scan('source.svg', b'<svg><script>bad()</script></svg>'))

    def test_credential_pattern_without_logging_value(self):
        credential = ('gh' + 'p_' + 'a' * 36).encode()
        self.assertEqual(self.scan('bad.txt', credential), [('bad.txt', 'GitHub credential')])

    def test_binary_and_font_rejected(self):
        self.assertTrue(self.scan('bad.txt', b'abc\x00def'))
        self.assertTrue(self.scan('bad.otf', b'font'))

    def test_symlink_never_followed(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'target.txt').write_text('source', encoding='utf-8')
            (root / 'link.txt').symlink_to(root / 'target.txt')
            self.assertEqual(scan_sources(root, ['link.txt'])[0], [('link.txt', 'symlinks are not source artifacts')])


class NarrationTests(unittest.TestCase):
    def test_spoken_numbers(self):
        self.assertEqual([spoken_number(n) for n in [0, 9, 10, 11, 20, 42, 99]], ['零', '九', '十', '十一', '二十', '四十二', '九十九'])
        with self.assertRaises(ValueError):
            spoken_number(100)
    def test_staging_failure_preserves_existing_products(self):
        with tempfile.TemporaryDirectory() as temporary:
            out = Path(temporary)
            (out / 'first.txt').write_text('original', encoding='utf-8')
            with self.assertRaises(TypeError):
                write_products(out, {'first.txt': '中文', 'second.txt': None})
            self.assertEqual((out / 'first.txt').read_text(encoding='utf-8'), 'original')
            self.assertFalse((out / 'second.txt').exists())

    def test_invalid_authored_cue_preserves_previous_products(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            scripts = root / 'scripts'; scripts.mkdir()
            for name in ['narration_io.py', 'case_data.py']:
                (scripts / name).write_bytes((ROOT / 'scripts' / name).read_bytes())
            design = root / 'design'; design.mkdir()
            (design / 'scenes.json').write_bytes((ROOT / 'design/scenes.json').read_bytes())
            narration = root / 'chapters/01-four-elements/narration'; narration.mkdir(parents=True)
            source = (ROOT / 'chapters/01-four-elements/narration/build_narration.py').read_text(encoding='utf-8')
            mutated = source.replace("'player':'B'", "'player':'C'", 1)
            self.assertNotEqual(mutated, source)
            generator = narration / 'build_narration.py'; generator.write_text(mutated, encoding='utf-8')
            (narration / 'timeline.json').write_text('keep-original', encoding='utf-8')
            result = subprocess.run([sys.executable, str(generator)], capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual((narration / 'timeline.json').read_text(encoding='utf-8'), 'keep-original')
            self.assertFalse((narration / 'game_theory_v2_zh.srt').exists())

    def test_ascii_locale_produces_identical_utf8_products(self):
        with tempfile.TemporaryDirectory() as temporary:
            out = Path(temporary)
            generator = ROOT / 'chapters/01-four-elements/narration/build_narration.py'
            env = {**os.environ, 'LC_ALL': 'C', 'LANG': 'C', 'PYTHONUTF8': '0', 'PYTHONCOERCECLOCALE': '0', 'PYTHONIOENCODING': 'ascii'}
            result = subprocess.run([sys.executable, str(generator), '--output-dir', str(out)], env=env, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr.decode('utf-8', errors='replace'))
            for name in ['timeline.json', 'game_theory_v2_zh.srt', 'voiceover_v2_zh.txt']:
                self.assertEqual((out / name).read_bytes(), (generator.parent / name).read_bytes())


class FontRecoveryTests(unittest.TestCase):
    def test_download_ignores_old_installed_candidate(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            local = root / 'old'; local.mkdir()
            (local / 'NotoSansCJK-Regular.ttc').write_bytes(b'old-font')
            output = root / 'prepared'
            payload = b'official-fixture'
            checksums = {key: hashlib.sha256(payload).hexdigest() for key in setup_fonts.OFFICIAL_SHA256}
            calls = []

            def prepare(source, target, kind, weight):
                self.assertEqual(source.suffix, '.download')
                target.write_bytes(payload)
                calls.append((kind, weight))
                return {'sha256': checksums[(kind, weight)]}

            with patch.object(sys, 'argv', ['setup_fonts.py', '--source-dir', str(local), '--output-dir', str(output), '--download']), \
                 patch.object(setup_fonts, 'OFFICIAL_SHA256', checksums), \
                 patch.object(setup_fonts.urllib.request, 'urlopen', side_effect=lambda *args, **kwargs: io.BytesIO(payload)), \
                 patch.object(setup_fonts, 'prepare', side_effect=prepare), \
                 redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                self.assertEqual(setup_fonts.main(), 0)
            self.assertEqual(len(calls), 4)

    def test_failed_checksum_preserves_invalid_existing_target(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary)
            target = output / 'NotoSansCJKSC-Regular.otf'
            target.write_bytes(b'keep-existing')
            with patch.object(sys, 'argv', ['setup_fonts.py', '--output-dir', str(output), '--download']), \
                 patch.object(setup_fonts, 'verify', side_effect=ValueError('old version')), \
                 patch.object(setup_fonts.urllib.request, 'urlopen', side_effect=lambda *args, **kwargs: io.BytesIO(b'wrong-checksum')), \
                 redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                self.assertEqual(setup_fonts.main(), 1)
            self.assertEqual(target.read_bytes(), b'keep-existing')
            self.assertFalse((output / 'prepared_font_manifest.json').exists())
            self.assertFalse(list(output.glob('*.download')))


if __name__ == '__main__':
    unittest.main()
