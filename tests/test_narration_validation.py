"""Run the actual narration builders in isolated repositories, with no media work."""
import ast
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
EPISODE = 'chapters/01-four-elements/narration/build_narration.py'
ORIGINAL = 'chapters/00-original-example/narration/build_narration.py'
MODES = [([], None), (['-O'], None), (['-OO'], None), ([], '1'), ([], '2')]
PRODUCTS = ['timeline.json', 'game_theory_v2_zh.srt', 'voiceover_v2_zh.txt', 'qa/metrics.json']


class NarrationValidationTests(unittest.TestCase):
    def fixture(self, root, source=EPISODE):
        for relative in ['design/scenes.json', 'chapters/00-original-example/chapter.json',
                         *['scripts/' + name for name in ['narration_io.py', 'narration_validation.py',
                           'case_data.py', 'text_contract.py', 'unicode-text-15.0.0.json']]]:
            target = root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / relative, target)
        builder = root / (ORIGINAL if source.startswith('templates/') else source)
        builder.parent.mkdir(parents=True, exist_ok=True)
        builder.write_bytes((ROOT / source).read_bytes())
        return builder

    def run_builder(self, builder, mode, out=None):
        flags, optimization = mode
        env = os.environ.copy()
        env.pop('PYTHONOPTIMIZE', None)
        env['PYTHONDONTWRITEBYTECODE'] = '1'
        if optimization is not None:
            env['PYTHONOPTIMIZE'] = optimization
        return subprocess.run([sys.executable, *flags, str(builder),
                               *(['--output-dir', str(out)] if out else [])],
                              env=env, capture_output=True, text=True, timeout=15)

    def test_real_builders_reject_symmetric_rr_unknown_owner_in_every_mode(self):
        for source in [EPISODE, ORIGINAL, 'templates/chapter/build_narration.py']:
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                builder = self.fixture(root, source)
                text = builder.read_text(encoding='utf-8')
                old = "'player':'B'" if source == EPISODE else "'player': 'B'"
                self.assertIn(old, text)
                builder.write_text(text.replace(old, old.replace("'B'", "'C'"), 1), encoding='utf-8')
                # Explicit symmetric RR fixture: a wrong owner must not hide behind equal numbers.
                scenes = json.loads((root / 'design/scenes.json').read_text())
                scenes['payoffs'][0][0] = [3, 3]
                (root / 'design/scenes.json').write_text(json.dumps(scenes), encoding='utf-8')
                for mode in MODES:
                    with self.subTest(source=source, mode=mode):
                        self.check_rejected_without_writes(builder, mode, 'score reveal player must be A or B')

    def check_rejected_without_writes(self, builder, mode, message):
        # Existing output uses the real default destination; include all four products.
        expected = {}
        for name in PRODUCTS:
            target = builder.parent / name
            target.parent.mkdir(parents=True, exist_ok=True)
            expected[name] = ('preserve existing ' + name + '\n原产品\n').encode('utf-8')
            target.write_bytes(expected[name])
        before = {p.relative_to(builder.parent): p.read_bytes()
                  for p in builder.parent.rglob('*') if p.is_file()}
        result = self.run_builder(builder, mode)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn('ValueError:', result.stderr)
        self.assertIn(message, result.stderr)
        after = {p.relative_to(builder.parent): p.read_bytes()
                 for p in builder.parent.rglob('*') if p.is_file()}
        self.assertEqual(before, after)
        missing = builder.parent / 'not-created'
        result = self.run_builder(builder, mode, missing)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(message, result.stderr)
        self.assertFalse(missing.exists(), 'Invalid input must fail before creating any output directory')

    def test_all_input_gates_survive_optimization_before_output(self):
        mutations = [
            ("cue['matrix_cell'] = 'XX'", 'unknown matrix cell'),
            ("cue.pop('matrix_cell')", 'needs a matrix cell'),
            ("cue['scores'] = [7, 8]", 'scores do not match'),
            ("cue.pop('scores')", 'scores do not match'),
            ("cue.pop('score_reveals')", 'one event per player'),
            ("cue['score_reveals'] = []", 'one event per player'),
            ("cue['score_reveals'].pop()", 'one event per player'),
            ("cue['score_reveals'][1]['player'] = 'A'", 'one event per player'),
            ("cue['score_reveals'][0]['value'] = 99", 'value does not match'),
            ("cue['score_reveals'][0]['offset'] = -1", 'offset must be within speech'),
            ("cue['score_reveals'][0]['offset'] = row['spoken_duration'] + .1", 'offset must be within speech'),
            ("cue['score_reveals'][0]['offset'] = float('nan')", 'offset must be within speech'),
            ("cue['score_reveals'][0]['offset'] = float('inf')", 'offset must be within speech'),
            ("cue['action'] = 'note'", 'scores require action reveal_scores'),
            ("cue['choices'] = {'A': '错误', 'B': '错误'}", 'choices require action highlight_choices'),
            ("cue.clear(); cue.update(action='highlight_choices', matrix_cell='RR', choices={'A': '错误', 'B': '错误'})", 'choices do not match'),
            ("cue.clear(); cue.update(action='highlight_choices', matrix_cell='RR')", 'both choices'),
            ("row['lines'] = ['错误。']", 'preserve the exact voiceover'),
            ("row['lines'] = ['超' * 23]", '22 readable'),
            ("row['lines'] = ['一。', '二。', '三。']", 'one or two lines'),
            ("row['start'] += .1", 'continuous from zero'),
            ("row['end'] = row['start']", 'invalid speech/display window'),
            ("row['voiceover_end'] = row['end'] + 1", 'invalid speech/display window'),
            ("row['spoken_duration'] = -1", 'speech must be positive'),
            ("row['pause_after'] = -1", 'pause nonnegative'),
            ("row['display_duration'] += 1", 'inconsistent narration timing'),
            ("row['spoken_duration'] = float('nan')", 'spoken_duration must be finite'),
        ]
        with tempfile.TemporaryDirectory() as directory:
            builder = self.fixture(Path(directory))
            source = builder.read_text(encoding='utf-8')
            marker = 'validate_narration(rows, CASE)'
            self.assertEqual(source.count(marker), 1)
            for mutation, message in mutations:
                injection = "row = next(r for r in rows if r['id'] == 's25_rr_score')\ncue = row['visual_cue']\n" + mutation + '\n'
                builder.write_text(source.replace(marker, injection + marker), encoding='utf-8')
                for mode in MODES:
                    with self.subTest(mutation=mutation, mode=mode):
                        self.check_rejected_without_writes(builder, mode, message)

    def test_absolute_reveal_window_survives_every_optimization_mode(self):
        with tempfile.TemporaryDirectory() as directory:
            builder = self.fixture(Path(directory))
            source = builder.read_text(encoding='utf-8')
            marker = 'validate_narration(rows, CASE)'
            select = "row = next(r for r in rows if r['id'] == 's25_rr_score')\ncue = row['visual_cue']\n"
            # Exact binary duration at the real, nonzero segment start makes the
            # immediately preceding Float64 offset round to end when added.
            zero_pause = ("row['spoken_duration'] = 8.0\n"
                          "row['voiceover_end'] = row['start'] + 8.0\n"
                          "row['end'] = row['voiceover_end']\n"
                          "row['display_duration'] = 8.0\n"
                          "row['pause_after'] = 0.0\n")
            variants = [
                ('zero-pause endpoint', "cue['score_reveals'][0]['offset'] = 8.0\n"),
                ('below-duration addition rounding',
                 "cue['score_reveals'][0]['offset'] = __import__('math').nextafter(8.0, 0.0)\n"
                 "if not cue['score_reveals'][0]['offset'] < row['spoken_duration']: raise RuntimeError('bad relative fixture')\n"),
                ('positive pause lost to rounding',
                 "row['pause_after'] = __import__('math').ulp(1.0)\n"
                 "cue['score_reveals'][0]['offset'] = 8.0\n"
                 "if row['voiceover_end'] + row['pause_after'] != row['end']: raise RuntimeError('bad pause fixture')\n"),
            ]
            for label, mutation in variants:
                injection = (select + zero_pause + mutation +
                             "if row['start'] + cue['score_reveals'][0]['offset'] != row['end']: raise RuntimeError('bad absolute fixture')\n")
                builder.write_text(source.replace(marker, injection + marker), encoding='utf-8')
                for mode in MODES:
                    with self.subTest(case=label, mode=mode):
                        self.check_rejected_without_writes(builder, mode, 'segment display window [start, end)')
            # An ordinary positive pause still permits reveals at speech end.
            injection = select + "for event in cue['score_reveals']: event['offset'] = row['spoken_duration']\n"
            builder.write_text(source.replace(marker, injection + marker), encoding='utf-8')
            for mode in MODES:
                with self.subTest(case='positive-pause speech endpoint', mode=mode):
                    out = Path(directory) / 'valid-endpoint'
                    result = self.run_builder(builder, mode, out)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    timeline = json.loads((out / 'timeline.json').read_text(encoding='utf-8'))
                    row = next(row for row in timeline['segments'] if row['id'] == 's25_rr_score')
                    self.assertGreater(row['pause_after'], 0)
                    for event in row['visual_cue']['score_reveals']:
                        self.assertEqual(event['offset'], row['spoken_duration'])
                        self.assertLess(row['start'] + event['offset'], row['end'])

    def test_valid_products_are_byte_identical_in_every_mode(self):
        for source in [EPISODE, ORIGINAL, 'templates/chapter/build_narration.py']:
            with tempfile.TemporaryDirectory() as directory:
                builder = self.fixture(Path(directory), source)
                baseline = None
                for mode in MODES:
                    with self.subTest(source=source, mode=mode):
                        out = Path(directory) / 'output'
                        result = self.run_builder(builder, mode, out)
                        self.assertEqual(result.returncode, 0, result.stderr)
                        reference = ROOT / Path(ORIGINAL if source.startswith('templates/') else source).parent
                        for name in PRODUCTS[:3]:
                            self.assertEqual((out / name).read_bytes(), (reference / name).read_bytes(), name)
                        produced = {name: (out / name).read_bytes()
                                    for name in PRODUCTS if (out / name).exists()}
                        if baseline is None:
                            baseline = produced
                        self.assertEqual(produced, baseline, 'All products, including metrics, must match across modes')

    def test_non_test_python_source_candidates_have_no_runtime_asserts(self):
        paths = subprocess.check_output(['git', 'ls-files', '--cached', '--others',
                                         '--exclude-standard', '-z', '--', '*.py'], cwd=ROOT).decode().split('\0')
        found = []
        for relative in sorted(set(paths) - {''}):
            if relative.startswith('tests/'):
                continue
            for node in ast.walk(ast.parse((ROOT / relative).read_text(encoding='utf-8'), filename=relative)):
                if isinstance(node, ast.Assert):
                    found.append(f'{relative}:{node.lineno}')
        self.assertEqual(found, [], 'Runtime input/QA validation must survive python -O/-OO')


if __name__ == '__main__':
    unittest.main()
