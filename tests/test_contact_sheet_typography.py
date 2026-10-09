"""Standalone Pillow boards: read-only font provenance and reduced-preview type.

Install requirements-media.txt to run the optional real Pillow integration checks.
All fixtures and generated pixels stay outside the source checkout.
"""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import struct
import zlib
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('contact_sheets', ROOT / 'production/make_contact_sheets.py')
boards = importlib.util.module_from_spec(spec)
spec.loader.exec_module(boards)
try:
    from PIL import Image, ImageDraw, ImageFont, PngImagePlugin
except ImportError:
    Image = None

FONT = ROOT / 'typography/fonts/NotoSansCJKSC-Regular.otf'
TEXT = '参与者知道什么信息，选择红色还是蓝色策略？每种组合各得什么收益。'


def fixture(directory, text=TEXT):
    """Synthetic PNG board fixture with current source identity; not renderer proof."""
    root = Path(directory)
    production = root / 'production'
    output = production / 'output'
    output.mkdir(parents=True)
    shutil.copyfile(ROOT / 'production/make_contact_sheets.py', production / 'make_contact_sheets.py')
    (production / 'src').symlink_to(ROOT / 'production/src', target_is_directory=True)
    (root / 'scripts').symlink_to(ROOT / 'scripts', target_is_directory=True)
    timeline_path = root / 'chapters/01-four-elements/narration/timeline.json'
    timeline_path.parent.mkdir(parents=True)
    timeline_path.write_text(json.dumps({'duration': 10, 'segments': [
        {'id': 'readable', 'start': 0, 'end': 10, 'voiceover': text}]}), encoding='utf-8')
    source = "import fs from 'node:fs'; import {createStillsManifest} from " + json.dumps((ROOT / 'production/src/checkpoints.mjs').as_uri()) + "; console.log(JSON.stringify(createStillsManifest(fs.readFileSync(process.argv[1]), {times:[1,2,3,4,5]})));"
    result = subprocess.run(['node', '--input-type=module', '-e', source, str(timeline_path)],
                            capture_output=True, text=True, check=True,
                            env={**os.environ, 'PYTHON': sys.executable})
    manifest = json.loads(result.stdout)
    fonts = root / 'typography/fonts'
    fonts.mkdir(parents=True)
    shutil.copyfile(FONT, fonts / FONT.name)
    shutil.copyfile(FONT.parent / 'prepared_font_manifest.json', fonts / 'prepared_font_manifest.json')
    for point in manifest['checkpoints']:
        path = output / point['file']
        metadata_text = json.dumps(boards.checkpoint_metadata(manifest, point))
        if Image is not None:
            image = Image.new('RGB', (1920, 1080), '#C4D8E5')
            # Visible contrasting frames make preview boundaries measurable.
            draw = ImageDraw.Draw(image)
            draw.rectangle((60, 60, 1860, 1020), fill='#FFFEF8', outline='#243E66', width=6)
            draw.multiline_text((120, 160), TEXT[:24] + '\n' + TEXT[24:],
                                font=ImageFont.truetype(str(FONT), 60), spacing=24, fill='#243E66')
            metadata = PngImagePlugin.PngInfo()
            metadata.add_text('StudioCheckpoint', metadata_text)
            image.save(path, pnginfo=metadata)
        else:
            # Font failures must occur before the optional Pillow dependency;
            # keep those entrypoint regressions active in the core-only suite.
            def chunk(kind, data):
                return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
            path.write_bytes(b'\x89PNG\r\n\x1a\n' +
                             chunk(b'IHDR', struct.pack('>IIBBBBB', 1920, 1080, 8, 2, 0, 0, 0)) +
                             chunk(b'tEXt', b'StudioCheckpoint\0' + metadata_text.encode('ascii')) +
                             chunk(b'IDAT', zlib.compress((b'\0' + b'\xff' * (1920 * 3)) * 1080)) +
                             chunk(b'IEND', b''))
        point['sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
    (output / boards.MANIFEST).write_text(json.dumps(manifest), encoding='utf-8')
    return root, manifest


@unittest.skipIf(not FONT.is_file(), 'Requires prepared SC fonts')
class ContactSheetTypographyTests(unittest.TestCase):
    def setUp(self):
        self.temporary = self.enterContext(tempfile.TemporaryDirectory(prefix='contact-sheet-typography-'))
        self.root, self.manifest = fixture(self.temporary)
        self.font = self.root / 'typography/fonts' / FONT.name
        self.output = self.root / 'production/output'
        self.board = self.output / 'custom_contact_sheet.png'
        self.board.write_bytes(b'existing board must survive rejection')
        self.manifest_path = self.font.parent / 'prepared_font_manifest.json'
        self.manifest_bytes = self.manifest_path.read_bytes()

    def run_entrypoint(self):
        # Exactly the npm make:episode:boards launcher and standalone __main__.
        return subprocess.run(['node', str(ROOT / 'scripts/python.mjs'),
                               str(self.root / 'production/make_contact_sheets.py')],
                              env={**os.environ, 'PYTHON': sys.executable},
                              capture_output=True, text=True, timeout=90)

    def assert_rejected(self, pattern):
        result = self.run_entrypoint()
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertRegex(result.stderr, pattern)
        self.assertNotIn('ModuleNotFoundError', result.stderr)
        self.assertEqual(self.board.read_bytes(), b'existing board must survive rejection')
        self.assertEqual(self.manifest_path.read_bytes(), self.manifest_bytes)

    def test_standalone_rejects_modified_cache_without_repair_or_overwrite(self):
        with self.font.open('ab') as file:
            file.write(b'cache mutation')
        mutated = self.font.read_bytes()
        self.assert_rejected('checksum|unknown modifications|re-extracted')
        self.assertEqual(self.font.read_bytes(), mutated)

    def test_standalone_rejects_other_face_even_with_self_reported_checksum(self):
        shutil.copyfile(FONT.parent / 'NotoSansCJKSC-Bold.otf', self.font)
        manifest = json.loads(self.manifest_bytes)
        manifest[self.font.name]['sha256'] = hashlib.sha256(self.font.read_bytes()).hexdigest()
        self.manifest_bytes = json.dumps(manifest).encode()
        self.manifest_path.write_bytes(self.manifest_bytes)
        self.assert_rejected('checksum|unknown modifications|re-extracted')

    def test_standalone_rejects_manifest_digest_disagreement(self):
        manifest = json.loads(self.manifest_bytes)
        manifest[self.font.name]['sha256'] = '0' * 64
        self.manifest_bytes = json.dumps(manifest).encode()
        self.manifest_path.write_bytes(self.manifest_bytes)
        self.assert_rejected('checksum|manifest')

    def test_standalone_rejects_uncovered_actual_label(self):
        with tempfile.TemporaryDirectory() as directory:
            root, _ = fixture(directory, TEXT + '\U0010ffff')
            self.root, self.output = root, root / 'production/output'
            self.board = self.output / 'custom_contact_sheet.png'
            self.board.write_bytes(b'existing board must survive rejection')
            self.font = root / 'typography/fonts' / FONT.name
            self.manifest_path = self.font.parent / 'prepared_font_manifest.json'
            self.manifest_bytes = self.manifest_path.read_bytes()
            self.assert_rejected('font missing characters')

    @unittest.skipIf(Image is None, 'Requires optional Pillow media dependency')
    def test_real_sc_board_has_readable_reduced_type_and_measured_clearance(self):
        result = self.run_entrypoint()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.manifest_path.read_bytes(), self.manifest_bytes)
        font_bytes = boards.verified_font_bytes(self.font, TEXT)
        font = ImageFont.truetype(io.BytesIO(font_bytes), boards.LABEL_SIZE)
        titlefont = ImageFont.truetype(io.BytesIO(font_bytes), boards.TITLE_SIZE)
        measure = ImageDraw.Draw(Image.new('RGB', (1, 1)))
        self.assertEqual(boards.wrap_label(measure, '甲乙。', font, 120), ['甲', '乙。'])
        layout = boards.board_layout(self.manifest, 'custom', self.manifest['checkpoints'], font, titlefont)
        with Image.open(self.board) as sheet:
            self.assertEqual(sheet.size, layout['size'])
            self.assertEqual(sheet.width, 3840)
            reduced = sheet.resize((1920, sheet.height // 2), Image.Resampling.LANCZOS)
            self.assertGreaterEqual(font.size * reduced.width / sheet.width, 30)
            self.assertGreaterEqual(titlefont.size * reduced.width / sheet.width, 38)
            # Actual rendered glyph ink after reduction, not merely size constants.
            for position, text, bounds in layout['placements']:
                x0, y0, x1, y1 = bounds
                crop = reduced.crop((x0 // 2, y0 // 2, (x1 + 1) // 2, (y1 + 1) // 2))
                ink = crop.convert('L').point(lambda value: 255 if value < 140 else 0)
                ink_bounds = ink.getbbox()
                self.assertIsNotNone(ink_bounds)
                self.assertGreaterEqual(ink_bounds[3] - ink_bounds[1], 25)
                self.assertLessEqual(x1, ((position[0] // 960) + 1) * 960 - 44)
                # Every text strip starts below image pixels by 32 native pixels.
                local_y = (position[1] - layout['header']) % layout['rh']
                self.assertGreaterEqual(local_y - 540, 32)
            proof = os.environ.get('CONTACT_SHEET_PROOF_DIR')
            if proof:
                destination = Path(proof)
                destination.mkdir(parents=True, exist_ok=True)
                sheet.save(destination / 'synthetic-contact-sheet-native.png')
                reduced.save(destination / 'synthetic-contact-sheet-1920.png')
                (destination / 'synthetic-layout.json').write_text(json.dumps(layout, ensure_ascii=False, indent=2))


class ContactSheetCoverageTests(unittest.TestCase):
    def test_reproduced_ttc_notdef_mapping_is_not_coverage(self):
        from unittest.mock import patch
        from fontTools.ttLib import TTCollection
        import test_notdef_glyph_coverage as glyph_fixture
        from setup_fonts import prepare
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            collection = TTCollection()
            with patch.object(glyph_fixture, 'TEXT', glyph_fixture.TEXT + TEXT):
                collection.fonts = [glyph_fixture.make_face('Sans', 'Regular', notdef=True)]
            source = root / 'source.ttc'
            collection.save(source)
            collection.close()
            target = root / FONT.name
            manifest = {target.name: prepare(source, target, 'Sans', 'Regular')}
            manifest_path = root / 'prepared_font_manifest.json'
            manifest_path.write_text(json.dumps(manifest))
            before = manifest_path.read_bytes()
            with self.assertRaisesRegex(ValueError, 'font missing characters.*龘'):
                boards.verified_font_bytes(target, '龘')
            self.assertEqual(manifest_path.read_bytes(), before)

    def test_verified_snapshot_rejects_font_replacement_during_proof(self):
        from unittest.mock import patch
        # This deterministic race regression isolates the snapshot binding only;
        # the standalone tests above exercise the unmocked provenance verifier.
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / FONT.name
            target.write_bytes(b'before')
            checksum = hashlib.sha256(b'before').hexdigest()
            (root / 'prepared_font_manifest.json').write_text(json.dumps({target.name: {'sha256': checksum}}))
            sys.path.insert(0, str(ROOT / 'scripts'))
            def replace(*args):
                target.write_bytes(b'after')
                return {'sha256': checksum}
            with patch('setup_fonts.verify_cached', side_effect=replace):
                with self.assertRaisesRegex(ValueError, 'changed during verification'):
                    boards.verified_font_bytes(target, TEXT)


if __name__ == '__main__':
    unittest.main()
