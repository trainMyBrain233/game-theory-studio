"""Unicode 15.0 text policy shared with text-contract.mjs; independent of host UCD."""
import json
import re
import sys
import unicodedata
from pathlib import Path

UNICODE = json.loads(Path(__file__).with_name('unicode-text-15.0.0.json').read_text(encoding='utf-8'))
TEXT_UNICODE_VERSION = UNICODE['unicodeVersion']
if sys.version_info < (3, 12) or tuple(map(int, unicodedata.unidata_version.split('.'))) < (15, 0, 0):
    raise RuntimeError('Text contracts require Python 3.12+ with Unicode 15.0+ normalization')


def includes(ranges, point):
    low, high = 0, len(ranges) - 1
    while low <= high:
        mid = (low + high) // 2
        start, end = ranges[mid]
        if point < start:
            high = mid - 1
        elif point > end:
            low = mid + 1
        else:
            return True
    return False


def points(text):
    if not isinstance(text, str):
        raise ValueError('Text must be a string')
    result = list(map(ord, text))
    if any(includes(UNICODE['unsupported'], point) for point in result):
        raise ValueError('Text must be well-formed and use supported, assigned Unicode 15.0 characters (no private-use code points)')
    return result


def readable_count(text):
    return sum(includes(UNICODE['readable'], point) for point in points(text))


def normalize_nfkc(text):
    """Reject table-external scalars first; use UAX #15 stability on Unicode 15 text."""
    points(text)
    return unicodedata.normalize('NFKC', text)


def single_line(text, role, require_visible=False):
    value = points(text)
    if (not value or includes(UNICODE['spaces'], value[0]) or includes(UNICODE['spaces'], value[-1])
            or any(includes(UNICODE['singleLineForbidden'], point) or includes(UNICODE['defaultIgnorable'], point) for point in value)):
        kind = 'label' if require_visible else 'text'
        raise ValueError(f'{role}: {kind} must be trimmed, well-formed, visible and single-line without controls or default-ignorable characters')
    if require_visible and not any(includes(UNICODE['readable'], point) for point in value):
        raise ValueError(f'{role}: label must contain a visible letter or number')


def normalized_label(label, role='Label'):
    try:
        single_line(label, role, True)
    except ValueError as error:
        raise ValueError(f'{role}: label must meet the Unicode text contract: {error}') from error
    previous_space, result = False, ''
    for char in normalize_nfkc(label):
        space = includes(UNICODE['spaces'], ord(char))
        if not space or not previous_space:
            result += ' ' if space else char
        previous_space = space
    return result


def validate_subtitle_line(line, role='Subtitle'):
    single_line(line, role)
    count = readable_count(line)
    if count < 1:
        raise ValueError(f'{role}: subtitle line must contain at least one readable letter or number')
    if count > 22:
        raise ValueError(f'{role}: subtitle line exceeds 22 readable characters')


def spoken_number(value):
    if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= 99:
        raise ValueError('The current teaching template supports integer scores 0..99')
    digits = '零一二三四五六七八九'
    if value < 10:
        return digits[value]
    tens, units = divmod(value, 10)
    return (digits[tens] if tens > 1 else '') + '十' + (digits[units] if units else '')


BREAKS = '，；。！？：'


def protected_subtitle_tokens(players, strategies, cue=None):
    cue = cue or {}
    tokens = list(players) + list(strategies)
    for index, owner in enumerate(('A', 'B')):
        if owner in cue.get('choices', {}):
            for verb in ('选', '也选', '选择'):
                choice = cue['choices'][owner]
                tokens.extend([f'{players[index]}{verb}{choice}', f'{players[index]}，{verb}{choice}'])
        if 'scores' in cue:
            result = f"得{spoken_number(cue['scores'][index])}分"
            tokens.extend([f'{players[index]}{result}', f'{players[index]}，{result}'])
    if 'scores' in cue and cue['scores'][0] == cue['scores'][1]:
        tokens.append(f"两个人，各得{spoken_number(cue['scores'][0])}分")
    return tokens


# Mirrored clause grammar in text-contract.mjs. Match current owner + predicate,
# rather than freezing an entire authored sentence or counting absent tokens.
CHOICE_VERB = r'(?:也)?(?:决定)?(?:选择|选)(?:了)?'
SCORE_VERB = r'(?:也)?(?:得到|获得|拿到|得|拿)(?:了)?'


def matching_clauses(voiceover, subjects, predicate):
    subject = '|'.join(re.escape(subject) for subject in subjects)
    return re.findall(rf'(?:^|[{BREAKS}])(?:现在|这时|其中|而|那么)?((?:{subject})，?{predicate})(?=$|[{BREAKS}])', voiceover)


def clauses_stay_whole(clauses, lines, voiceover):
    return all(sum(line.count(clause) for line in lines) == voiceover.count(clause) for clause in clauses)


def validate_cue_narration(lines, voiceover, players, cue=None, role='Subtitle'):
    cue = cue or {}
    if cue.get('action') not in ('highlight_choices', 'reveal_scores'):
        return

    def require_clause(subjects, predicate, description):
        clauses = matching_clauses(voiceover, subjects, predicate)
        if not clauses:
            raise ValueError(f'{role}: narration missing current-case {description} clause')
        if not clauses_stay_whole(clauses, lines, voiceover):
            raise ValueError(f'{role}: subtitle splits protected current-case token or clause: {description}')

    if cue['action'] == 'highlight_choices':
        for index, owner in enumerate(('A', 'B')):
            choice = re.escape(cue.get('choices', {}).get(owner, ''))
            require_clause([players[index]], rf'{CHOICE_VERB}{choice}(?:牌)?', f'{owner} choice')
    else:
        scores = cue.get('scores', [])
        if len(scores) == 2 and scores[0] == scores[1]:
            collective = matching_clauses(voiceover, ['两个人', '两人', '双方', '他们'],
                                          rf'(?:各|都){SCORE_VERB}{spoken_number(scores[0])}分')
            if collective:
                if not clauses_stay_whole(collective, lines, voiceover):
                    raise ValueError(f'{role}: subtitle splits protected current-case token or clause: collective score')
                return
        for index, owner in enumerate(('A', 'B')):
            require_clause([players[index]], rf'{SCORE_VERB}{spoken_number(scores[index])}分', f'{owner} score')


def validate_subtitle_chunk(lines, voiceover, players, strategies, cue=None, role='Subtitle'):
    if not isinstance(lines, list) or not 1 <= len(lines) <= 2:
        raise ValueError(f'{role}: subtitles require one or two lines')
    for line in lines:
        validate_subtitle_line(line, role)
    if ''.join(lines) != voiceover:
        raise ValueError(f'{role}: subtitle lines must preserve the exact voiceover')
    if any(line[-1] not in BREAKS for line in lines[:-1]):
        raise ValueError(f'{role}: subtitle splits a semantic clause; break only after clause punctuation')
    for token in protected_subtitle_tokens(players, strategies, cue):
        if sum(line.count(token) for line in lines) != voiceover.count(token):
            raise ValueError(f'{role}: subtitle splits protected current-case token or clause: {token}')


def validate_subtitle_lines(lines, voiceover, players, strategies, cue=None, role='Subtitle'):
    validate_subtitle_chunk(lines, voiceover, players, strategies, cue, role)
    validate_cue_narration(lines, voiceover, players, cue, role)
