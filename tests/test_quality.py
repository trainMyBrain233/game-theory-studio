"""Negative fixtures for publication boundaries, UTF-8 I/O and font recovery."""
from pathlib import Path
import hashlib
import base64
import json
from contextlib import redirect_stdout, redirect_stderr
import io
import os
import subprocess
import sys
import tempfile
import struct
import zlib
import zipfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from narration_io import write_products
from qa_source import scan_sources
from case_data import spoken_number
import setup_fonts


class PublicationTests(unittest.TestCase):
    @staticmethod
    def archive_fixture(root):
        # Git is only used to create a genuine source checkout, never added to its exported ZIP.
        for relative in ['.gitignore', 'production/.gitignore', 'package.json', 'scripts/qa_source.py',
                         'production/pack_source.py', 'production/verify_source_archive.py',
                         'schemas/chapter.schema.json', 'schemas/timeline.schema.json',
                         'schemas/scenes.schema.json', 'schemas/tokens.schema.json',
                         'chapters/01-four-elements/chapter.json']:
            target = root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((ROOT / relative).read_bytes())
        package = json.loads((root / 'package.json').read_text(encoding='utf-8'))
        package['version'] = '0.1.0'
        (root / 'package.json').write_text(json.dumps(package), encoding='utf-8')
        chapter = root / 'chapters/01-four-elements/chapter.json'
        config = json.loads(chapter.read_text(encoding='utf-8'))
        config['contentVersion'] = '1.2.3'
        chapter.write_text(json.dumps(config), encoding='utf-8')
        for args in [['init', '-q'], ['add', '.'],
                     ['-c', 'user.name=Source Fixture', '-c', 'user.email=source-fixture@example.invalid', 'commit', '-qm', 'source fixture']]:
            subprocess.run(['git', *args], cwd=root, check=True, capture_output=True)

    def test_archive_records_clean_and_dirty_source_identity_and_actual_versions(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.archive_fixture(root)
            commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
            archive_path = root / 'production/output/game_theory_studio_public_source.zip'
            for dirty in [False, True]:
                if dirty:
                    (root / 'new-source.txt').write_text('original new source', encoding='utf-8')
                    package = json.loads((root / 'package.json').read_text(encoding='utf-8'))
                    package['version'] = '0.1.1'
                    (root / 'package.json').write_text(json.dumps(package), encoding='utf-8')
                run = subprocess.run([sys.executable, str(root / 'production/pack_source.py'), '--public'], capture_output=True)
                self.assertEqual(run.returncode, 0, run.stderr.decode('utf-8'))
                with zipfile.ZipFile(archive_path) as archive:
                    manifest = json.loads(archive.read('game-theory-studio/SOURCE_MANIFEST.json'))
                    self.assertEqual(manifest['source']['commit'], commit)
                    self.assertEqual(manifest['source']['working_tree_dirty'], dirty)
                    self.assertEqual(manifest['source']['reproducible_from_commit'], not dirty)
                    self.assertEqual(manifest['versions']['project'], '0.1.1' if dirty else '0.1.0')
                    self.assertEqual(manifest['versions']['schemas']['schemas/timeline.schema.json']['data_version'], '2.1')
                    self.assertEqual(manifest['versions']['schemas']['schemas/scenes.schema.json']['id'], 'urn:game-theory-studio:scenes:1.0')
                    self.assertEqual(manifest['versions']['chapters']['01-four-elements']['content'], '1.2.3')
                    for entry in manifest['files']:
                        data = archive.read('game-theory-studio/' + entry['path'])
                        self.assertEqual(len(data), entry['bytes'])
                        self.assertEqual(hashlib.sha256(data).hexdigest(), entry['sha256'])

    def test_archive_extraction_integrity_without_git_rejects_tampering_and_unlisted_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            root = base / 'checkout'; root.mkdir()
            self.archive_fixture(root)
            subprocess.run([sys.executable, str(root / 'production/pack_source.py'), '--public'], check=True, capture_output=True)
            with zipfile.ZipFile(root / 'production/output/game_theory_studio_public_source.zip') as archive:
                archive.extractall(base / 'extracted')
            extracted = base / 'extracted/game-theory-studio'
            self.assertFalse((extracted / '.git').exists())
            command = [sys.executable, str(extracted / 'production/verify_source_archive.py')]
            for _ in range(2):
                run = subprocess.run(command, cwd=extracted, capture_output=True)
                self.assertEqual(run.returncode, 0, run.stderr.decode('utf-8'))
            extra = extracted / 'unlisted.txt'; extra.write_text('not in manifest')
            run = subprocess.run(command, cwd=extracted, capture_output=True)
            self.assertNotEqual(run.returncode, 0); self.assertIn(b'unlisted files', run.stderr)
            extra.unlink()
            package = extracted / 'package.json'; package.write_bytes(package.read_bytes() + b'\n')
            run = subprocess.run(command, cwd=extracted, capture_output=True)
            self.assertNotEqual(run.returncode, 0); self.assertIn(b'Archive source differs', run.stderr)
            # Development source QA reports the honest Git boundary instead of silently initializing Git.
            run = subprocess.run([sys.executable, str(extracted / 'scripts/qa_source.py')], capture_output=True)
            self.assertNotEqual(run.returncode, 0); self.assertIn(b'requires a Git checkout', run.stderr)

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

    @staticmethod
    def pixel_uri():
        # An original opaque-white 1x1 PNG with valid chunk CRCs, never an external image.
        def chunk(kind, data):
            return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
        png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 6, 0, 0, 0))
        png += chunk(b'IDAT', zlib.compress(b'\x00\xff\xff\xff\xff')) + chunk(b'IEND', b'')
        return 'data:image/png;base64,' + base64.b64encode(png).decode('ascii')

    def test_svg_extension_case_and_namespace_are_not_image_bypasses(self):
        uri = self.pixel_uri()
        for suffix in ['svg', 'SVG', 'sVg']:
            for source in [f'<svg><image href="{uri}"/></svg>',
                           f'<SVG><IMAGE HREF="{uri}"/></SVG>',
                           f'<s:svg xmlns:s="http://www.w3.org/2000/svg"><s:image href="{uri}"/></s:svg>']:
                with self.subTest(suffix=suffix, source=source[:50]):
                    self.assertTrue(self.scan('embedded.' + suffix, source.encode('utf-8')))

    def test_svg_parsed_attribute_and_element_variants_are_rejected(self):
        for source in ['<svg xmlns:x="urn:test"><x:SCRIPT/></svg>',
                       '<svg xmlns:x="urn:test"><x:ForeignObject/></svg>',
                       '<svg><use href="d&#97;ta:image/png;base64,AA=="/></svg>',
                       '<svg xmlns:x="urn:test"><use x:HREF="HTTPS://example.invalid/a.svg"/></svg>',
                       '<svg><use href=" //example.invalid/a.svg"/></svg>',
                       '<svg><path style="fill:url(https://example.invalid/a.svg)"/></svg>',
                       '<svg><x:image/></svg>',
                       '<!DOCTYPE svg [<!ENTITY source "data:bad">]><svg><use href="&source;"/></svg>']:
            with self.subTest(source=source):
                self.assertTrue(self.scan('source.SVG', source.encode('utf-8')))

    def test_svg_local_vector_namespace_references_are_allowed(self):
        source = b'<s:svg xmlns:s="http://www.w3.org/2000/svg" xmlns:l="http://www.w3.org/1999/xlink"><s:defs><s:path id="shape" d="M0 0L1 1"/></s:defs><s:use l:href="#shape" fill="url(#shape)"/></s:svg>'
        self.assertFalse(self.scan('original.SVG', source))

    def test_public_pack_rejects_embedded_svg_in_every_extension_case_without_replacing_archive(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for relative in ['scripts/qa_source.py', 'production/pack_source.py']:
                target = root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((ROOT / relative).read_bytes())
            subprocess.run(['git', 'init', '-q', str(root)], check=True, capture_output=True)
            archive = root / 'production/output/game_theory_studio_public_source.zip'
            archive.parent.mkdir()
            archive.write_bytes(b'preserve-existing-archive')
            for suffix in ['svg', 'SVG', 'sVg']:
                target = root / ('embedded.' + suffix)
                target.write_text(f'<svg><image href="{self.pixel_uri()}"/></svg>', encoding='utf-8')
                run = subprocess.run([sys.executable, str(root / 'production/pack_source.py'), '--public'], capture_output=True)
                self.assertNotEqual(run.returncode, 0)
                self.assertIn(target.name.encode(), run.stderr)
                self.assertEqual(archive.read_bytes(), b'preserve-existing-archive')
                target.unlink()

    def test_credential_pattern_without_logging_value(self):
        credential = ('gh' + 'p_' + 'a' * 36).encode()
        self.assertEqual(self.scan('bad.txt', credential), [('bad.txt', 'GitHub credential')])

    def test_binary_and_font_rejected(self):
        self.assertTrue(self.scan('bad.txt', b'abc\x00def'))
        self.assertTrue(self.scan('bad.otf', b'font'))

    def test_private_text_source_never_published(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'private_characters').mkdir()
            (root / 'private_characters/note.txt').write_text('private', encoding='utf-8')
            self.assertTrue(scan_sources(root, ['private_characters/note.txt'])[0])

    def test_private_archive_mode_is_disabled(self):
        destination = ROOT / 'production/output/game_theory_studio_public_source.zip'
        before = destination.read_bytes() if destination.exists() else None
        run = subprocess.run([sys.executable, str(ROOT / 'production/pack_source.py')], capture_output=True)
        self.assertNotEqual(run.returncode, 0)
        self.assertIn(b'--public', run.stderr)
        self.assertEqual(destination.read_bytes() if destination.exists() else None, before)

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
    def test_reused_official_font_rejects_unknown_bytes_even_with_self_consistent_manifest(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / 'NotoSansCJKSC-Regular.otf'
            target.write_bytes(b'changed-complete-font')
            recorded = {'source_kind':'official_pinned_otf','sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
            with patch.object(setup_fonts, 'verify', return_value={'sha256':recorded['sha256']}) as metadata:
                with self.assertRaisesRegex(ValueError, 'pinned official'):
                    setup_fonts.verify_cached(target, 'Sans', 'Regular', recorded)
                metadata.assert_not_called()

    def test_verify_only_does_not_rewrite_manifest_or_certify_modified_official_targets(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary)
            payload = b'known-official-fixture'
            checksum = hashlib.sha256(payload).hexdigest()
            checksums = {key: checksum for key in setup_fonts.OFFICIAL_SHA256}
            for kind, weight in checksums:
                (output / f'Noto{kind}CJKSC-{weight}.otf').write_bytes(payload)
            manifest = output / 'prepared_font_manifest.json'
            entries = {f'Noto{kind}CJKSC-{weight}.otf':{'sha256':checksum} for kind,weight in checksums}
            entries['preserve'] = 'original provenance'
            import json
            manifest.write_text(json.dumps(entries) + '\n', encoding='utf-8')
            before = manifest.read_bytes()
            with patch.object(sys, 'argv', ['setup_fonts.py','--output-dir',str(output),'--verify-only']), \
                 patch.object(setup_fonts, 'OFFICIAL_SHA256', checksums), \
                 patch.object(setup_fonts, 'verify', return_value={'sha256':checksum}), \
                 redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                self.assertEqual(setup_fonts.main(), 0)
                self.assertEqual(manifest.read_bytes(), before)
                (output / 'NotoSansCJKSC-Regular.otf').write_bytes(payload + b'changed')
                self.assertEqual(setup_fonts.main(), 1)
                self.assertEqual(manifest.read_bytes(), before)

    def test_local_ttc_manifest_cannot_certify_a_different_extracted_target(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / 'source.ttc'; source.write_bytes(b'trusted-complete-source')
            target = root / 'prepared.otf'; target.write_bytes(b'changed-prepared-face')
            recorded = {'source_kind':'local_ttc_extraction','source':str(source),'face_index':2,
                        'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
                        'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
            expected = {'sha256':hashlib.sha256(b'original-derived-face').hexdigest(),'face_index':2}
            with patch.object(setup_fonts, 'prepare', return_value=expected):
                with self.assertRaisesRegex(ValueError, 're-extracted'):
                    setup_fonts.verify_cached(target,'Sans','Regular',recorded)

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
