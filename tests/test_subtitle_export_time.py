"""Validate the exact millisecond windows emitted by every Python SRT builder."""
import json
from pathlib import Path
import tempfile
import unittest

import test_narration_validation as validation

SOURCES = [validation.EPISODE, validation.ORIGINAL, 'templates/chapter/build_narration.py']


def snapshot(root):
    return {str(path.relative_to(root)): path.read_bytes()
            for path in root.rglob('*') if path.is_file()}


def boundary_injection(rows, end, start):
    return (f"first, second = {rows}[:2]\n"
            f"first['end'] = {end!r}\n"
            "first['voiceover_end'] = first['end'] / 2\n"
            "first['spoken_duration'] = first['voiceover_end'] - first['start']\n"
            "first['pause_after'] = first['end'] - first['voiceover_end']\n"
            "first['display_duration'] = first['end'] - first['start']\n"
            f"second['start'] = {start!r}\n"
            "second['spoken_duration'] = second['voiceover_end'] - second['start']\n"
            "second['display_duration'] = second['end'] - second['start']\n")


class SubtitleExportTimeTests(unittest.TestCase):
    def test_real_builders_reject_quantized_gaps_and_overlaps_without_publication(self):
        helper = validation.NarrationValidationTests()
        for source in SOURCES:
            with tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                builder = helper.fixture(root, source)
                original = builder.read_text(encoding='utf-8')
                rows, case = ('rows', 'CASE') if source == validation.EPISODE else ('segments', 'case')
                marker = f'validate_narration({rows}, {case})'
                self.assertEqual(original.count(marker), 1)
                output = root / 'output'
                valid = helper.run_builder(builder, validation.MODES[0], output)
                self.assertEqual(valid.returncode, 0, valid.stderr)
                before = snapshot(output)
                for end, start, message in [(1.0004996, 1.0005004, 'SRT display windows must be continuous after millisecond rounding'),
                                            (1.0005004, 1.0004996, 'SRT display windows must be continuous after millisecond rounding'),
                                            (.0001, .0001, 'SRT display window collapses after millisecond rounding')]:
                    # Both boundary differences pass the source-time tolerance.
                    self.assertLess(abs(end - start), .0001)
                    builder.write_text(original.replace(marker, boundary_injection(rows, end, start) + marker), encoding='utf-8')
                    for mode in validation.MODES:
                        with self.subTest(source=source, mode=mode, end=end, start=start):
                            failed = helper.run_builder(builder, mode, output)
                            self.assertNotEqual(failed.returncode, 0)
                            self.assertIn(message, failed.stderr)
                            self.assertEqual(snapshot(output), before)
                            absent = root / 'not-created'
                            failed = helper.run_builder(builder, mode, absent)
                            self.assertNotEqual(failed.returncode, 0)
                            self.assertIn(message, failed.stderr)
                            self.assertFalse(absent.exists())

    def test_real_builders_keep_distinct_and_adjacent_rounded_windows(self):
        helper = validation.NarrationValidationTests()
        for source in SOURCES:
            with tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                builder = helper.fixture(root, source)
                original = builder.read_text(encoding='utf-8')
                rows, case = ('rows', 'CASE') if source == validation.EPISODE else ('segments', 'case')
                marker = f'validate_narration({rows}, {case})'
                for end, start, stamp in [(1.0004996, 1.0004999, '00:00:01,000'),
                                          (1.0005001, 1.0005004, '00:00:01,001')]:
                    builder.write_text(original.replace(marker, boundary_injection(rows, end, start) + marker), encoding='utf-8')
                    for mode in validation.MODES:
                        with self.subTest(source=source, mode=mode, end=end):
                            output = root / 'output'
                            result = helper.run_builder(builder, mode, output)
                            self.assertEqual(result.returncode, 0, result.stderr)
                            srt = (output / 'game_theory_v2_zh.srt').read_text(encoding='utf-8')
                            windows = [line.split(' --> ') for line in srt.splitlines() if ' --> ' in line]
                            self.assertEqual(windows[0][1], stamp)
                            self.assertEqual(windows[1][0], stamp)
                            self.assertTrue(all(left[1] == right[0] for left, right in zip(windows, windows[1:])))
                            timeline = json.loads((output / 'timeline.json').read_text(encoding='utf-8'))
                            self.assertEqual(timeline['segments'][0]['end'], end)
                            self.assertEqual(timeline['segments'][1]['start'], start)


if __name__ == '__main__':
    unittest.main()
