"""Fault-inject font-set publication; real provenance checks have separate QA."""
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import narration_io
import setup_fonts

FACES = list(setup_fonts.OFFICIAL_SHA256)
NAMES = [f'Noto{kind}CJKSC-{weight}.otf' for kind, weight in FACES]
MANIFEST = 'prepared_font_manifest.json'
REAL_RGLOB = Path.rglob


def snapshot(root):
    result = {}
    for path in REAL_RGLOB(root, '*'):
        name = str(path.relative_to(root))
        if path.is_symlink():
            result[name] = ('symlink', os.readlink(path))
        elif path.is_dir():
            result[name] = ('directory',)
        else:
            result[name] = hashlib.sha256(path.read_bytes()).hexdigest()
    return result


class FontPublicationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.output = self.root / 'output'
        self.sources = self.root / 'sources'
        self.sources.mkdir()
        self.payloads = {}
        for kind, weight in FACES:
            payload = f'new {kind} {weight}'.encode()
            self.payloads[kind, weight] = payload
            (self.sources / f'Noto{kind}CJKsc-{weight}.otf').write_bytes(payload)
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        real_rglob = Path.rglob
        # Installed fonts must not win source selection over these isolated fixtures.
        self.stack.enter_context(patch.object(Path, 'rglob', autospec=True, side_effect=
            lambda path, pattern: real_rglob(path, pattern) if path == self.sources else iter(())))
        self.stack.enter_context(patch.object(setup_fonts, 'current_characters', return_value=[]))
        self.stack.enter_context(patch.object(setup_fonts, 'OFFICIAL_SHA256', {
            face: hashlib.sha256(data).hexdigest() for face, data in self.payloads.items()}))
        self.stack.enter_context(patch.object(setup_fonts, 'verify', side_effect=lambda file, *args: {
            'sha256': hashlib.sha256(file.read_bytes()).hexdigest()}))
        self.stack.enter_context(patch.object(setup_fonts, 'verify_cached', side_effect=ValueError('stale fixture')))

    def seed(self):
        self.output.mkdir()
        for name in NAMES:
            (self.output / name).write_bytes(('old ' + name).encode())
        (self.output / MANIFEST).write_text('{}\n')
        (self.output / 'unrelated.txt').write_text('preserve this')

    def run_setup(self, *arguments):
        argv = ['setup_fonts.py', '--output-dir', str(self.output),
                '--source-dir', str(self.sources), *arguments]
        with patch.object(sys, 'argv', argv), contextlib.redirect_stdout(io.StringIO()), \
                contextlib.redirect_stderr(io.StringIO()):
            return setup_fonts.main()

    def test_success_publishes_all_faces_and_matching_manifest(self):
        self.seed()
        self.assertEqual(self.run_setup(), 0)
        manifest = json.loads((self.output / MANIFEST).read_text())
        for face, name in zip(FACES, NAMES):
            self.assertEqual((self.output / name).read_bytes(), self.payloads[face])
            self.assertEqual(manifest[name]['sha256'], hashlib.sha256(self.payloads[face]).hexdigest())
            self.assertEqual(manifest[name]['source_kind'], 'official_pinned_otf')
            self.assertEqual(manifest[name]['source'], setup_fonts.official_source(*face))
        self.assertEqual(len(list(self.output.iterdir())), 6)

    def test_second_and_fourth_source_failures_leave_entire_set_unchanged(self):
        for seeded in (False, True):
            for failing in (1, 3):
                with self.subTest(seeded=seeded, failing=failing):
                    self.output = self.root / f'source-{seeded}-{failing}'
                    if seeded:
                        self.seed()
                    before = snapshot(self.output)
                    kind, weight = FACES[failing]
                    source = self.sources / f'Noto{kind}CJKsc-{weight}.otf'
                    source.write_bytes(b'wrong checksum')
                    with self.assertRaisesRegex(ValueError, 'pinned official checksum'):
                        self.run_setup()
                    source.write_bytes(self.payloads[kind, weight])
                    self.assertEqual(snapshot(self.output), before)
                    self.assertEqual(self.output.exists(), seeded)

    def test_second_fourth_and_manifest_replace_failures_roll_back(self):
        real_replace = os.replace
        for seeded in (False, True):
            for failing in (NAMES[1], NAMES[3], MANIFEST):
                with self.subTest(seeded=seeded, failing=failing):
                    self.output = self.root / f'replace-{seeded}-{failing}'
                    if seeded:
                        self.seed()
                    before = snapshot(self.output)
                    hit = []
                    def replace(source, target):
                        if Path(target) == self.output / failing and Path(source).parent.name == 'new':
                            hit.append(failing)
                            raise OSError('injected publication failure')
                        return real_replace(source, target)
                    with patch.object(narration_io.os, 'replace', side_effect=replace):
                        with self.assertRaisesRegex(OSError, 'injected publication failure'):
                            self.run_setup()
                    self.assertEqual(hit, [failing])
                    self.assertEqual(snapshot(self.output), before)
                    self.assertEqual(self.output.exists(), seeded)

    def test_download_failure_never_publishes_partial_set(self):
        self.seed()
        before = snapshot(self.output)
        responses = [io.BytesIO(self.payloads[FACES[0]]), OSError('download failed'),
                     io.BytesIO(self.payloads[FACES[2]]), io.BytesIO(self.payloads[FACES[3]])]
        with patch.object(setup_fonts.urllib.request, 'urlopen', side_effect=responses):
            self.assertEqual(self.run_setup('--download'), 1)
        self.assertEqual(snapshot(self.output), before)

    def test_symlink_or_directory_products_are_rejected_without_changes(self):
        for name in (NAMES[0], MANIFEST):
            for link in (False, True):
                with self.subTest(name=name, link=link):
                    self.output = self.root / f'unsafe-{name}-{link}'
                    self.seed()
                    target = self.output / name
                    target.unlink()
                    if link:
                        outside = self.root / f'external-{name}'
                        outside.write_text('{}' if name == MANIFEST else 'external font')
                        target.symlink_to(outside)
                    else:
                        target.mkdir()
                    before = snapshot(self.root)
                    with self.assertRaises((ValueError, IsADirectoryError)):
                        self.run_setup()
                    self.assertEqual(snapshot(self.root), before)

    def test_cached_faces_join_transaction_and_verify_only_is_read_only(self):
        self.seed()
        old = {name: (self.output / name).read_bytes() for name in NAMES}
        entries = {name: {'sha256': hashlib.sha256(data).hexdigest()} for name, data in old.items()}
        (self.output / MANIFEST).write_text(json.dumps(entries))
        def cached(target, *args):
            return entries[target.name]
        with patch.object(setup_fonts, 'verify_cached', side_effect=cached):
            before = snapshot(self.output)
            with patch.object(setup_fonts, 'write_products', side_effect=AssertionError('must not publish')):
                self.assertEqual(self.run_setup('--verify-only'), 0)
            self.assertEqual(snapshot(self.output), before)
            self.assertEqual(self.run_setup(), 0)
        for name, data in old.items():
            self.assertEqual((self.output / name).read_bytes(), data)
        self.assertEqual(json.loads((self.output / MANIFEST).read_text()), entries)

    def test_output_directory_symlink_cannot_redirect_publication(self):
        real_output = self.root / 'real-output'
        real_output.mkdir()
        (real_output / 'unrelated').write_bytes(b'keep')
        self.output.symlink_to(real_output, target_is_directory=True)
        before = snapshot(self.root)
        with self.assertRaisesRegex(ValueError, 'symbolic links'):
            self.run_setup()
        self.assertEqual(snapshot(self.root), before)

    def test_verify_only_missing_output_does_not_create_directory(self):
        with patch.object(setup_fonts, 'write_products', side_effect=AssertionError('must not publish')):
            self.assertEqual(self.run_setup('--verify-only'), 1)
        self.assertFalse(self.output.exists())

    def test_verify_only_preserves_existing_files_even_on_failure(self):
        self.seed()
        before = snapshot(self.output)
        with patch.object(setup_fonts, 'write_products', side_effect=AssertionError('must not publish')):
            self.assertEqual(self.run_setup('--verify-only'), 1)
        self.assertEqual(snapshot(self.output), before)


if __name__ == '__main__':
    unittest.main()
