"""Small shared content model for the two-player, two-strategy teaching case."""
import json
import re

from text_contract import (BREAKS, normalized_label, readable_count, spoken_number,
                           validate_subtitle_lines)


class Case:
    def __init__(self, root):
        data = json.loads((root / 'design/scenes.json').read_text(encoding='utf-8'))
        self.players = [actor['label'] for actor in data['actors']]
        self.strategies = [strategy['label'] for strategy in data['strategies']]
        for labels, role, limit in [(self.players, 'Player', 4), (self.strategies, 'Strategy', 2)]:
            if len(labels) != 2 or any(not isinstance(label, str) or not 1 <= len(label) <= limit for label in labels):
                raise ValueError(f'{role}: two labels of at most {limit} Unicode code points are required')
            if len({normalized_label(label, role) for label in labels}) != 2:
                raise ValueError(f'{role} visible labels must differ')
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

    def validate_lines(self, lines, text, cue=None):
        validate_subtitle_lines(lines, text, self.players, self.strategies, cue)

    def lines(self, text, cue=None):
        if readable_count(text) <= 22:
            self.validate_lines([text], text, cue)
            return [text]
        for index, char in enumerate(text):
            if char in BREAKS and index < len(text) - 1:
                candidate = [text[:index + 1], text[index + 1:]]
                try:
                    self.validate_lines(candidate, text, cue)
                    return candidate
                except ValueError:
                    continue
        raise ValueError('Subtitle needs more than two semantic lines; shorten the authored sentence')
