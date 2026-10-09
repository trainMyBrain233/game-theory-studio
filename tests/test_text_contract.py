"""Pure-text regression coverage. No fonts, Canvas, audio or tracked product writes."""
from pathlib import Path
import json
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from case_data import Case
from text_contract import (normalized_label, readable_count, validate_subtitle_lines,
                           TEXT_UNICODE_VERSION)


class TextContractTests(unittest.TestCase):
    def test_runtime_floor_fails_before_using_an_older_normalizer(self):
        for patch in ['sys.version_info=(3,11,9)', "unicodedata.unidata_version='14.0.0'"]:
            source = ("import sys,unicodedata; sys.path.insert(0,'scripts'); " + patch
                      + '; import text_contract')
            result = subprocess.run([sys.executable, '-c', source], cwd=ROOT, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Python 3.12+ with Unicode 15.0+', result.stderr)

    def test_unicode_contract_counts_letters_and_all_number_categories(self):
        self.assertEqual(TEXT_UNICODE_VERSION, '15.0.0')
        case = Case(ROOT)
        for char in ['é', '㐀', '𠀀', '\U00031350', '١', 'Ⅻ', '²']:
            with self.subTest(char=char):
                self.assertEqual(readable_count(char * 23), 23)
                self.assertEqual(case.lines(char * 22), [char * 22])
                with self.assertRaisesRegex(ValueError, 'two semantic lines'):
                    case.lines(char * 23)
                self.assertEqual(case.lines(char * 22 + '，' + char), [char * 22 + '，', char])
        self.assertEqual(readable_count('e\u0301，。 𝟜🙂'), 2)

    def test_case_generator_rejects_semantic_breaks_inside_changed_labels(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'design').mkdir()
            data = json.loads((ROOT / 'design/scenes.json').read_text(encoding='utf-8'))
            data['actors'][0]['label'] = '甲，乙'
            data['actors'][1]['label'] = '丙'
            (root / 'design/scenes.json').write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
            case = Case(root)
            cue = {'choices': {'A': '红', 'B': '蓝'}, 'scores': [27, 31]}
            for lines in [
                ['甲，', '乙选红，丙选蓝。'],
                ['甲，乙选', '红，丙选蓝。'],
                ['甲，乙，', '得二十七分，丙得三十一分。'],
            ]:
                with self.subTest(lines=lines), self.assertRaisesRegex(ValueError, 'splits'):
                    case.validate_lines(lines, ''.join(lines), cue)
            case.validate_lines(['甲，乙选红，', '丙选蓝。'], '甲，乙选红，丙选蓝。', cue)

    def test_condition_and_result_are_complete_on_their_own_lines(self):
        text = '如果乙方选退出，甲方得二十七分。'
        args = (text, ['甲方', '乙方'], ['合作', '退出'],
                {'choices': {'A': '合作', 'B': '退出'}, 'scores': [27, 31]})
        validate_subtitle_lines(['如果乙方选退出，', '甲方得二十七分。'], *args)
        for lines in [['如果乙方选', '退出，甲方得二十七分。'], ['如果乙方选退出，甲方', '得二十七分。']]:
            with self.subTest(lines=lines), self.assertRaisesRegex(ValueError, 'splits'):
                validate_subtitle_lines(lines, *args)

    def test_nfkc_collisions_and_visibility_share_the_supported_repertoire(self):
        for first, second in [('Ａ', 'A'), ('é', 'e\u0301'), ('A B', 'A\u00A0B'), ('\U0001E030', 'а')]:
            self.assertEqual(normalized_label(first), normalized_label(second))
        for label in [' A', 'A\t', 'A\nB', '\u3164', 'A\u034F', '\uD800', '\U00001C89']:
            with self.subTest(label=ascii(label)), self.assertRaisesRegex(ValueError, 'label must'):
                normalized_label(label)


if __name__ == '__main__':
    unittest.main()
