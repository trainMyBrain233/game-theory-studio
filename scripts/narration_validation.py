"""Optimization-safe validation of authored narration before writing products."""
import math


def require(condition, message):
    if not condition:
        raise ValueError(message)


def finite_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def validate_narration(rows, case):
    require(bool(rows), 'Narration needs at least one segment')
    previous_end = 0
    for row in rows:
        context = row['id']
        for field in ('start', 'end', 'voiceover_end', 'spoken_duration', 'pause_after', 'display_duration'):
            require(finite_number(row[field]), f'{context}: {field} must be finite')
        require(row['spoken_duration'] > 0 and row['pause_after'] >= 0,
                f'{context}: speech must be positive and pause nonnegative')
        require(row['end'] > row['start'] and row['voiceover_end'] <= row['end'],
                f'{context}: invalid speech/display window')
        require(abs(row['start'] - previous_end) < .0001,
                f'{context}: narration must be continuous from zero')
        for actual, expected in (
            (row['voiceover_end'], row['start'] + row['spoken_duration']),
            (row['end'], row['voiceover_end'] + row['pause_after']),
            (row['display_duration'], row['end'] - row['start']),
        ):
            require(abs(actual - expected) < .0011, f'{context}: inconsistent narration timing')
        previous_end = row['end']
        cue = row['visual_cue']
        cell = cue.get('matrix_cell')
        if 'matrix_cell' in cue:
            require(isinstance(cell, str) and cell in case.values, f'{context}: unknown matrix cell')
        if any(field in cue for field in ('choices', 'scores', 'score_reveals')):
            require(cell in case.values, f'{context}: cue payload needs a matrix cell')
        if 'choices' in cue:
            require(cue.get('action') == 'highlight_choices', f'{context}: choices require action highlight_choices')
            expected = {'A': case.strategies[0 if cell[0] == 'R' else 1],
                        'B': case.strategies[0 if cell[1] == 'R' else 1]}
            require(cue['choices'] == expected, f'{context}: choices do not match the matrix cell')
        if cue.get('action') == 'highlight_choices':
            require(cell in case.values and 'choices' in cue,
                    f'{context}: highlight_choices needs a matrix cell and both choices')
        if any(field in cue for field in ('scores', 'score_reveals')):
            require(cue.get('action') == 'reveal_scores', f'{context}: scores require action reveal_scores')
        if cue.get('action') == 'reveal_scores':
            require(cell in case.values, f'{context}: reveal_scores needs a matrix cell')
            require(cue.get('scores') == case.values[cell], f'{context}: scores do not match the matrix')
            reveals = cue.get('score_reveals')
            require(isinstance(reveals, list) and len(reveals) == 2,
                    f'{context}: complete cell reveal needs one event per player A and B')
            owners = []
            for reveal in reveals:
                require(isinstance(reveal, dict) and reveal.get('player') in ('A', 'B'),
                        f'{context}: score reveal player must be A or B')
                owner = reveal['player']
                owners.append(owner)
                offset = reveal.get('offset')
                require(finite_number(offset) and 0 <= offset <= row['spoken_duration'],
                        f'{context}: score reveal offset must be within speech')
                # Consumers add Float64 start + offset before testing the half-open
                # display window; relative bounds alone miss addition rounding.
                reveal_time = row['start'] + offset
                require(row['start'] <= reveal_time < row['end'],
                        f'{context}: score reveal must occur within the segment display window [start, end)')
                require(reveal.get('value') == cue['scores'][0 if owner == 'A' else 1],
                        f'{context}: score reveal value does not match its player')
            require(sorted(owners) == ['A', 'B'],
                    f'{context}: complete cell reveal needs one event per player A and B')
        case.validate_lines(row['lines'], row['voiceover'], row['visual_cue'])
