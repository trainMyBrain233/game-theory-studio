"""Real Pillow two-group boards retain their whole prior set on late failure.

Synthetic solid stills exercise publication, not episode renderer acceptance.
"""
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import test_contact_sheet_typography as typography

boards, ROOT, FONT, Image = typography.boards, typography.ROOT, typography.FONT, typography.Image
sys.path.insert(0, str(ROOT / 'scripts'))
import narration_io

NAMES = ('keyframes_contact_sheet.png', 'transitions_contact_sheet.png')


@unittest.skipIf(Image is None or not FONT.is_file(), 'Requires Pillow and prepared SC fonts')
class ContactSheetPublicationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = tempfile.TemporaryDirectory(prefix='contact-publication-fixture-')
        cls.addClassCleanup(cls.fixture.cleanup)
        root = Path(cls.fixture.name)
        cls.timeline = root / 'timeline.json'
        cls.timeline.write_bytes(boards.TIMELINE.read_bytes())
        cls.stills = root / 'stills'
        cls.stills.mkdir()
        source = "import fs from 'node:fs'; import {createStillsManifest} from " + json.dumps((ROOT / 'production/src/checkpoints.mjs').as_uri()) + "; console.log(JSON.stringify(createStillsManifest(fs.readFileSync(process.argv[1]))));"
        result = subprocess.run(['node', '--input-type=module', '-e', source, str(cls.timeline)],
                                capture_output=True, text=True, check=True,
                                env={**os.environ, 'PYTHON': sys.executable})
        cls.manifest = json.loads(result.stdout)
        for point in cls.manifest['checkpoints']:
            metadata = typography.PngImagePlugin.PngInfo()
            metadata.add_text('StudioCheckpoint', json.dumps(boards.checkpoint_metadata(cls.manifest, point)))
            image = Image.new('RGB', (1920, 1080), '#C4D8E5')
            target = cls.stills / point['file']
            image.save(target, pnginfo=metadata)
            point['sha256'] = hashlib.sha256(target.read_bytes()).hexdigest()
        (cls.stills / boards.MANIFEST).write_text(json.dumps(cls.manifest))

    def setUp(self):
        self.directory = Path(self.enterContext(tempfile.TemporaryDirectory(prefix='contact-publication-')))
        self.output = self.directory / 'output'
        shutil.copytree(self.stills, self.output)
        self.timeline_path = self.directory / 'timeline.json'
        shutil.copyfile(self.timeline, self.timeline_path)
        (self.output / 'user-file.txt').write_bytes(b'unrelated user bytes')

    def old_boards(self):
        for name in NAMES:
            (self.output / name).write_bytes(('old bytes ' + name).encode())

    def snapshot(self):
        return {p.name: ('symlink', os.readlink(p)) if p.is_symlink() else
                ('directory', tuple(sorted(q.name for q in p.iterdir()))) if p.is_dir() else
                ('file', p.read_bytes()) for p in self.output.iterdir()}

    def run_boards(self):
        with patch('sys.stdout', new_callable=io.StringIO) as stdout:
            boards.main(self.output, self.timeline_path, FONT)
            return stdout.getvalue()

    def test_success_publishes_both_real_png_boards(self):
        self.old_boards()
        printed = self.run_boards()
        for name in NAMES:
            self.assertIn(name, printed)
            with Image.open(self.output / name) as image:
                self.assertEqual(image.format, 'PNG')
                self.assertEqual(image.width, 3840)
                image.load()
        self.assertEqual((self.output / 'user-file.txt').read_bytes(), b'unrelated user bytes')
        self.assertFalse(any(p.name.startswith('.narration-') for p in self.output.iterdir()))

    def test_late_target_directory_preserves_first_board(self):
        self.old_boards()
        target = self.output / NAMES[1]
        target.unlink()
        target.mkdir()
        (target / 'keep').write_bytes(b'user-owned directory')
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, 'regular file'):
            self.run_boards()
        self.assertEqual(self.snapshot(), before)
        self.assertEqual((target / 'keep').read_bytes(), b'user-owned directory')

    def test_late_replace_failure_restores_existing_or_removes_all_new_boards(self):
        for existing in (False, True):
            with self.subTest(existing=existing):
                if existing:
                    self.old_boards()
                before = self.snapshot()
                real_replace = narration_io.os.replace
                published = []
                def fail_second(source, target):
                    if Path(source).parent.name == 'new':
                        if Path(target).name == NAMES[1]:
                            self.assertEqual(published, [NAMES[0]])
                            raise PermissionError('injected second board publication failure')
                        published.append(Path(target).name)
                    return real_replace(source, target)
                with patch.object(narration_io.os, 'replace', side_effect=fail_second):
                    with self.assertRaisesRegex(PermissionError, 'second board publication'):
                        self.run_boards()
                self.assertEqual(published, [NAMES[0]])
                self.assertEqual(self.snapshot(), before)

    def test_second_png_encoding_failure_never_publishes_first(self):
        self.old_boards()
        before = self.snapshot()
        real_save = Image.Image.save
        calls = []
        def fail_second(image, file, *args, **kwargs):
            calls.append(file)
            if len(calls) == 2:
                raise OSError('injected second PNG encoding failure')
            return real_save(image, file, *args, **kwargs)
        with patch.object(Image.Image, 'save', new=fail_second):
            with self.assertRaisesRegex(OSError, 'second PNG encoding'):
                self.run_boards()
        self.assertEqual(len(calls), 2)
        self.assertEqual(self.snapshot(), before)

    def test_output_symlinks_are_rejected_without_changing_their_targets(self):
        self.old_boards()
        outside = self.directory / 'outside.png'
        outside.write_bytes(b'outside must survive')
        (self.output / NAMES[1]).unlink()
        (self.output / NAMES[1]).symlink_to(outside)
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, 'symbolic links'):
            self.run_boards()
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(outside.read_bytes(), b'outside must survive')
        (self.output / NAMES[1]).unlink()
        self.old_boards()
        alias = self.directory / 'output-link'
        alias.symlink_to(self.output, target_is_directory=True)
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, 'symbolic links'):
            boards.main(alias, self.timeline_path, FONT)
        self.assertEqual(self.snapshot(), before)

    def test_source_identity_is_checked_again_before_second_publish_and_rolls_back(self):
        for mutation in ('timeline', 'render-fingerprint'):
            with self.subTest(mutation=mutation):
                shutil.copyfile(self.timeline, self.timeline_path)
                shutil.copyfile(self.stills / boards.MANIFEST, self.output / boards.MANIFEST)
                self.old_boards()
                before = {name: (self.output / name).read_bytes() for name in NAMES}
                real_replace = narration_io.os.replace
                publications = []
                def mutate_after_first(source, target):
                    result = real_replace(source, target)
                    if Path(source).parent.name == 'new':
                        publications.append(Path(target).name)
                        if mutation == 'timeline':
                            self.timeline_path.write_bytes(self.timeline_path.read_bytes() + b'\n')
                        else:
                            manifest = json.loads((self.output / boards.MANIFEST).read_text())
                            manifest['render']['sha256'] = '0' * 64
                            (self.output / boards.MANIFEST).write_text(json.dumps(manifest))
                    return result
                with patch.object(narration_io.os, 'replace', side_effect=mutate_after_first):
                    with self.assertRaisesRegex(ValueError, 'Stale still (checkpoint manifest|render identity)'):
                        self.run_boards()
                self.assertEqual(publications, [NAMES[0]])
                self.assertEqual({name: (self.output / name).read_bytes() for name in NAMES}, before)
                self.assertFalse(any(p.name.startswith('.narration-') for p in self.output.iterdir()))


if __name__ == '__main__':
    unittest.main()
