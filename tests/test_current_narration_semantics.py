"""Current-cue text meaning is checked before all builders publish any products."""
import json
from pathlib import Path
import tempfile
import unittest

import test_narration_validation as helpers


class CurrentNarrationSemanticsTests(unittest.TestCase):
    fixture = helpers.NarrationValidationTests.fixture
    run_builder = helpers.NarrationValidationTests.run_builder
    check_rejected_without_writes = helpers.NarrationValidationTests.check_rejected_without_writes

    def changed_case(self, root):
        path = root / 'design/scenes.json'
        data = json.loads(path.read_text(encoding='utf-8'))
        for actor, label in zip(data['actors'], ['甲方', '乙方']):
            actor['label'] = label
        for strategy, label in zip(data['strategies'], ['合作', '退出']):
            strategy['label'] = label
        data['payoffs'] = [[[27, 31], [28, 32]], [[29, 33], [30, 34]]]
        path.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')

    def test_all_builders_reject_paired_stale_names_and_values_before_writing_in_all_modes(self):
        for source in [helpers.EPISODE, helpers.ORIGINAL, 'templates/chapter/build_narration.py']:
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                builder = self.fixture(root, source)
                self.changed_case(root)
                text = builder.read_text(encoding='utf-8')
                rows, case = ('rows', 'CASE') if source == helpers.EPISODE else ('segments', 'case')
                marker = f'validate_narration({rows}, {case})'
                mutations = [
                    ('show_two_actions', '每人选红牌或蓝牌。'),
                    ('reveal_scores', '小A得零分，小B得五分。'),
                    ('reveal_scores', '甲方得零分，乙方得五分。'),
                    ('reveal_scores', '小A得二十七分，小B得三十一分。'),
                    ('reveal_scores', '甲方得三十一分，乙方得二十七分。'),
                ]
                if source == helpers.EPISODE:
                    mutations.extend([
                        ('introduce_players', '假设小A和小B，玩一轮积分游戏。'),
                        ('introduce_matrix_rows', '行，是小A的选择。'),
                        ('introduce_matrix_rows', '行，是乙方的选择。'),
                        ('introduce_matrix_columns', '列，是小B的选择。'),
                        ('introduce_score_order', '先读乙方的得分，再读甲方的得分。'),
                        ('map_actions_to_pure_strategies', '红和蓝就是两个纯策略。'),
                        ('show_multi_round_plan', '第一轮选红；以后再决定。'),
                        ('highlight_choices', '小A选红，小B选红。'),
                        ('highlight_choices', '甲方选红，乙方选红。'),
                        ('highlight_choices', '小A选合作，小B选合作。'),
                    ])
                for action, stale in mutations:
                    injection = (f"row = next(row for row in {rows} if row['visual_cue'].get('action') == {action!r})\n"
                                 f"row['voiceover'] = row['text'] = {stale!r}\n"
                                 "row['lines'] = [row['voiceover']]\nrow['breath_points'] = []\n")
                    builder.write_text(text.replace(marker, injection + marker), encoding='utf-8')
                    for mode in helpers.MODES:
                        with self.subTest(source=source, mode=mode, stale=stale):
                            self.check_rejected_without_writes(builder, mode, 'narration missing current-case')

    def test_all_default_builders_accept_in_all_modes(self):
        for source in [helpers.EPISODE, helpers.ORIGINAL, 'templates/chapter/build_narration.py']:
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                builder = self.fixture(root, source)
                baseline = None
                for mode in helpers.MODES:
                    result = self.run_builder(builder, mode, root / 'valid-products')
                    self.assertEqual(result.returncode, 0, result.stderr)
                    produced = {str(path.relative_to(root / 'valid-products')): path.read_bytes()
                                for path in (root / 'valid-products').rglob('*') if path.is_file()}
                    if baseline is None:
                        baseline = produced
                    self.assertEqual(produced, baseline)

    def test_all_builders_accept_changed_case_and_custom_clauses_in_all_modes(self):
        for source in [helpers.EPISODE, helpers.ORIGINAL, 'templates/chapter/build_narration.py']:
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                builder = self.fixture(root, source)
                self.changed_case(root)
                text = builder.read_text(encoding='utf-8')
                rows, case = ('rows', 'CASE') if source == helpers.EPISODE else ('segments', 'case')
                marker = f'validate_narration({rows}, {case})'
                injection = (f"for row in {rows}:\n"
                             "    cue = row['visual_cue']\n"
                             "    if cue.get('action') == 'reveal_scores':\n"
                             "        from text_contract import spoken_number\n"
                             f"        a, b = {case}.players\n"
                             "        av, bv = map(spoken_number, cue['scores'])\n"
                             "        row['voiceover'] = f'{b}获得{bv}分；{a}，拿到{av}分。'\n"
                             "    elif cue.get('action') == 'highlight_choices':\n"
                             f"        a, b = {case}.players\n"
                             "        ac, bc = cue['choices']['A'], cue['choices']['B']\n"
                             "        row['voiceover'] = f'{b}选择{bc}；现在{a}选了{ac}。'\n"
                             "    else: continue\n"
                             f"    row['lines'] = {case}.lines(row['voiceover'], cue)\n"
                             "    row['text'] = '\\n'.join(row['lines'])\n"
                             "    row['breath_points'] = []\n")
                for custom in [False, True]:
                    builder.write_text(text.replace(marker, injection + marker) if custom else text, encoding='utf-8')
                    baseline = None
                    for mode in helpers.MODES:
                        with self.subTest(source=source, mode=mode, custom=custom):
                            out = root / 'valid-products'
                            result = self.run_builder(builder, mode, out)
                            self.assertEqual(result.returncode, 0, result.stderr)
                            timeline = json.loads((out / 'timeline.json').read_text(encoding='utf-8'))
                            self.assertEqual(timeline['visual_contract']['participants'], ['甲方', '乙方'])
                            reference = helpers.ROOT / Path(helpers.ORIGINAL if source.startswith('templates/') else source).parent / 'timeline.json'
                            self.assertEqual(len(timeline['segments']), len(json.loads(reference.read_text(encoding='utf-8'))['segments']))
                            produced = {name: (out / name).read_bytes() for name in helpers.PRODUCTS if (out / name).exists()}
                            if baseline is None:
                                baseline = produced
                            self.assertEqual(produced, baseline)


if __name__ == '__main__':
    unittest.main()
