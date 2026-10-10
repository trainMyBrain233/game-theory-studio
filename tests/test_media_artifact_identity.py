"""Real, bounded three-frame files bind QA reports to an unambiguous artifact."""
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
MODES = ([], ['-O'], ['-OO'])


@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'),
                     'Requires real ffmpeg and ffprobe')
class MediaArtifactIdentity(unittest.TestCase):
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
        cls.sources = {}
        for width in (1920, 3840):
            source = cls.root / f'source_{width}.mp4'
            run = subprocess.run([
                'ffmpeg', '-nostdin', '-v', 'error', '-y', '-filter_threads', '1',
                '-f', 'lavfi', '-i', f'color=c=black:s={width}x{width * 9 // 16}:r=30:d=0.1',
                '-vf', 'setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709',
                '-c:v', 'libx264', '-threads:v', '1', '-preset', 'ultrafast',
                '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709',
                '-color_primaries', 'bt709', '-color_trc', 'bt709',
                '-movflags', '+faststart', str(source)],
                capture_output=True, text=True, timeout=30)
            if run.returncode:
                raise RuntimeError(run.stderr)
            cls.sources[width] = source

    def run_cli(self, paths, flags, *options):
        env = {key: value for key, value in os.environ.items() if key != 'PYTHONOPTIMIZE'}
        return subprocess.run([sys.executable, *flags, str(self.qa / 'verify_media.py'),
                               *map(str, paths), *options], env=env,
                              capture_output=True, text=True, timeout=30)

    def report(self, path):
        return self.qa / ('media_' + path.name + '.json')

    def assert_passed(self, result, path, width, expected_width):
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        report = json.loads(self.report(path).read_text())
        self.assertEqual(report['video']['width'], width)
        self.assertEqual(report['video']['height'], width * 9 // 16)
        self.assertEqual(report['expected_width'], expected_width)
        self.assertEqual(report['sha256'], hashlib.sha256(path.read_bytes()).hexdigest())
        self.assertEqual(report['full_decode']['frames'], 3)
        self.assertEqual(report['full_decode']['status'], 'passed')

    def test_canonical_sizes_pass_and_swapped_encodes_preserve_previous_report(self):
        for width in (1920, 3840):
            path = self.root / f'game_theory_textbook_v2_clean_{width}.mp4'
            for flags in MODES:
                with self.subTest(width=width, flags=flags):
                    shutil.copyfile(self.sources[width], path)
                    self.assert_passed(self.run_cli([path], flags), path, width, width)
                    previous = self.report(path).read_bytes()
                    other_width = 3840 if width == 1920 else 1920
                    shutil.copyfile(self.sources[other_width], path)
                    result = self.run_cli([path], flags)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn(f'Expected {width}x{width * 9 // 16} video for this artifact', result.stderr)
                    self.assertNotIn('encoding contract passed', result.stdout)
                    self.assertEqual(self.report(path).read_bytes(), previous)
                    # An explicit CLI width cannot override a canonical identity.
                    result = self.run_cli([path], flags, '--width', str(other_width))
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn('conflicts with canonical artifact', result.stderr)
                    self.assertEqual(self.report(path).read_bytes(), previous)

    def test_default_artifact_and_preview_names_enforce_resolution(self):
        default = self.qa.parent / 'output/game_theory_textbook_v2_clean_1920.mp4'
        default.parent.mkdir(exist_ok=True)
        shutil.copyfile(self.sources[3840], default)
        self.report(default).unlink(missing_ok=True)
        for flags in MODES:
            result = self.run_cli([], flags)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Expected 1920x1080 video for this artifact', result.stderr)
            self.assertFalse(self.report(default).exists())
            for width in (1920, 3840):
                preview = self.root / f'transition_preview_{width}.mp4'
                shutil.copyfile(self.sources[3840 if width == 1920 else 1920], preview)
                result = self.run_cli([preview], flags, '--duration', '.1')
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(f'Expected {width}x{width * 9 // 16} video for this artifact', result.stderr)
                self.assertFalse(self.report(preview).exists())

    def test_custom_width_and_legacy_custom_resolution(self):
        for width in (1920, 3840):
            path = self.root / 'custom.mp4'
            shutil.copyfile(self.sources[width], path)
            for flags in MODES:
                with self.subTest(width=width, flags=flags):
                    self.assert_passed(self.run_cli([path], flags), path, width, None)
                    self.assert_passed(self.run_cli([path], flags, '--width', str(width)),
                                       path, width, width)
                    previous = self.report(path).read_bytes()
                    other_width = 3840 if width == 1920 else 1920
                    result = self.run_cli([path], flags, '--width', str(other_width))
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn('video for this artifact', result.stderr)
                    self.assertEqual(self.report(path).read_bytes(), previous)

    def test_duplicate_basenames_rejected_before_any_report_publication(self):
        paths = []
        for directory, width in [('review-a', 1920), ('review-b', 3840)]:
            path = self.root / directory / 'episode.mp4'
            path.parent.mkdir(exist_ok=True)
            shutil.copyfile(self.sources[width], path)
            paths.append(path)
        # A valid earlier item must not publish when later arguments collide.
        earlier = self.root / 'earlier.mp4'
        shutil.copyfile(self.sources[1920], earlier)
        for flags in MODES:
            for existing in (False, True):
                for inputs in ([earlier, *paths], [earlier, paths[0], paths[0]]):
                    with self.subTest(flags=flags, existing=existing, inputs=inputs):
                        for path in (earlier, paths[0]):
                            self.report(path).unlink(missing_ok=True)
                            if existing:
                                self.report(path).write_bytes(b'previous verified report')
                        result = self.run_cli(inputs, flags)
                        self.assertNotEqual(result.returncode, 0)
                        self.assertIn('Duplicate media report identity: media_episode.mp4.json', result.stderr)
                        self.assertNotIn('encoding contract passed', result.stdout)
                        for path in (earlier, paths[0]):
                            if existing:
                                self.assertEqual(self.report(path).read_bytes(), b'previous verified report')
                            else:
                                self.assertFalse(self.report(path).exists())

    def test_portable_case_and_unicode_report_aliases_are_rejected(self):
        for names in [('Episode.mp4', 'episode.mp4'), ('épisode.mp4', 'e\u0301pisode.mp4')]:
            paths = [self.root / directory / name
                     for directory, name in zip(('review-case-a', 'review-case-b'), names)]
            for path, width in zip(paths, (1920, 3840)):
                path.parent.mkdir(exist_ok=True)
                shutil.copyfile(self.sources[width], path)
            for flags in MODES:
                for existing in (False, True):
                    with self.subTest(names=names, flags=flags, existing=existing):
                        for path in paths:
                            self.report(path).unlink(missing_ok=True)
                            if existing:
                                self.report(path).write_bytes(b'previous verified report')
                        result = self.run_cli(paths, flags)
                        self.assertNotEqual(result.returncode, 0)
                        self.assertIn('Duplicate media report identity', result.stderr)
                        self.assertNotIn('encoding contract passed', result.stdout)
                        for path in paths:
                            if existing:
                                self.assertEqual(self.report(path).read_bytes(), b'previous verified report')
                            else:
                                self.assertFalse(self.report(path).exists())

    def test_distinct_names_publish_independent_reports(self):
        paths = [self.root / f'distinct_{width}.mp4' for width in (1920, 3840)]
        for path, width in zip(paths, (1920, 3840)):
            shutil.copyfile(self.sources[width], path)
        for flags in MODES:
            result = self.run_cli(paths, flags)
            for path, width in zip(paths, (1920, 3840)):
                self.assert_passed(result, path, width, None)


if __name__ == '__main__':
    unittest.main()
