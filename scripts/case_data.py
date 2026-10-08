"""Small shared content model for the two-player, two-strategy teaching case."""
import json
import re


def spoken_number(value):
    if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= 99:
        raise ValueError('The current teaching template supports integer scores 0..99')
    digits = '零一二三四五六七八九'
    if value < 10:
        return digits[value]
    tens, units = divmod(value, 10)
    return (digits[tens] if tens > 1 else '') + '十' + (digits[units] if units else '')


class Case:
    def __init__(self, root):
        data = json.loads((root / 'design/scenes.json').read_text(encoding='utf-8'))
        self.players = [actor['label'] for actor in data['actors']]
        self.strategies = [strategy['label'] for strategy in data['strategies']]
        self.values = dict(zip(['RR', 'RB', 'BR', 'BB'], [pair for row in data['payoffs'] for pair in row]))
        for pair in self.values.values():
            for score in pair:
                spoken_number(score)
        self.replacements = dict(zip(['小A', '小B', '红', '蓝'], self.players + self.strategies))
        self.is_original = self.players == ['小A', '小B'] and self.strategies == ['红', '蓝'] and self.values == {'RR': [3, 3], 'RB': [0, 5], 'BR': [5, 0], 'BB': [1, 1]}

    def text(self, text):
        return re.sub(r'小A|小B|红|蓝', lambda match: self.replacements[match.group()], text)

    def cue(self, cue):
        result = dict(cue)
        if 'choices' in result:
            result['choices'] = {who: self.text(choice) for who, choice in result['choices'].items()}
        if 'note' in result:
            result['note'] = self.text(result['note'])
        if 'scores' in result and not self.is_original:
            a, b = self.values[result['matrix_cell']]
            result['note'] = f'固定数对（{a}，{b}）；先读{self.players[0]}，再读{self.players[1]}。'
        return result

    def score_text(self, cell):
        a, b = self.values[cell]
        if a == b:
            return f'两个人，各得{spoken_number(a)}分。'
        return f'{self.players[0]}得{spoken_number(a)}分，{self.players[1]}得{spoken_number(b)}分。'

    def lines(self, text):
        readable = lambda value: len(re.findall(r'[\u4e00-\u9fffA-Za-z0-9]', value))
        if readable(text) <= 22:
            return [text]
        for index, char in enumerate(text):
            if char in '，；。' and readable(text[:index+1]) <= 22 and readable(text[index+1:]) <= 22:
                return [text[:index+1], text[index+1:]]
        raise ValueError('Subtitle needs more than two semantic lines; shorten the authored sentence')
