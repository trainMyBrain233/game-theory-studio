/** Pinned Unicode 15.0 text policy; host-independent properties, standard stable NFKC. */
import unicode from './unicode-text-15.0.0.json' with {type: 'json'};

export const TEXT_UNICODE_VERSION = unicode.unicodeVersion;
const requireText = (condition, message) => {if (!condition) throw new Error(message);};
function includes(ranges, point) {
  let low = 0, high = ranges.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1, [start, end] = ranges[mid];
    if (point < start) high = mid - 1;
    else if (point > end) low = mid + 1;
    else return true;
  }
  return false;
}
function points(text) {
  requireText(typeof text === 'string', 'Text must be a string');
  const result = Array.from(text, char => char.codePointAt(0));
  requireText(result.every(point => !includes(unicode.unsupported, point)), 'Text must be well-formed and use supported, assigned Unicode 15.0 characters (no private-use code points)');
  return result;
}
export function readableCount(text) {
  return points(text).filter(point => includes(unicode.readable, point)).length;
}
/** Inputs are restricted to assigned Unicode 15.0 scalars before normalization.
 * Node 22+ supports Unicode >=15; UAX #15 normalization stability then applies.
 */
export function normalizeNFKC(text) {
  points(text);
  return text.normalize('NFKC');
}
function singleLine(text, role, requireVisible) {
  const value = points(text);
  requireText(value.length > 0 && !includes(unicode.spaces, value[0]) && !includes(unicode.spaces, value.at(-1)) &&
    value.every(point => !includes(unicode.singleLineForbidden, point) && !includes(unicode.defaultIgnorable, point)),
  `${role}: ${requireVisible ? 'label' : 'text'} must be trimmed, well-formed, visible and single-line without controls or default-ignorable characters`);
  if (requireVisible) requireText(value.some(point => includes(unicode.readable, point)), `${role}: label must contain a visible letter or number`);
}
export function normalizedLabel(label, role = 'Label') {
  try {singleLine(label, role, true);} catch (error) {throw new Error(`${role}: label must meet the Unicode text contract: ${error.message}`);}
  let previousSpace = false, result = '';
  for (const char of normalizeNFKC(label)) {
    const space = includes(unicode.spaces, char.codePointAt(0));
    if (!space || !previousSpace) result += space ? ' ' : char;
    previousSpace = space;
  }
  return result;
}
export function validateSubtitleLine(line, role = 'Subtitle') {
  singleLine(line, role, false);
  const count = readableCount(line);
  requireText(count >= 1, `${role}: subtitle line must contain at least one readable letter or number`);
  requireText(count <= 22, `${role}: subtitle line exceeds 22 readable characters`);
}
export function spokenNumber(value) {
  requireText(Number.isInteger(value) && value >= 0 && value <= 99, 'Narrated score must be integer 0..99');
  const digits = '零一二三四五六七八九';
  return value < 10 ? digits[value] : (value >= 20 ? digits[Math.floor(value / 10)] : '') + '十' + (value % 10 ? digits[value % 10] : '');
}
const BREAKS = '，；。！？：';
export function protectedSubtitleTokens(players, strategies, cue = {}) {
  const tokens = [...players, ...strategies];
  for (const [index, owner] of ['A', 'B'].entries()) {
    if (cue.choices?.[owner]) for (const verb of ['选', '也选', '选择']) {
      tokens.push(`${players[index]}${verb}${cue.choices[owner]}`, `${players[index]}，${verb}${cue.choices[owner]}`);
    }
    if (cue.scores) {
      const result = `得${spokenNumber(cue.scores[index])}分`;
      tokens.push(`${players[index]}${result}`, `${players[index]}，${result}`);
    }
  }
  if (cue.scores && cue.scores[0] === cue.scores[1]) tokens.push(`两个人，各得${spokenNumber(cue.scores[0])}分`);
  return tokens;
}
/** Break only at authored clause punctuation, never inside current-case labels/results. */
export function validateSubtitleLines(lines, voiceover, players, strategies, cue = {}, role = 'Subtitle') {
  requireText(Array.isArray(lines) && lines.length >= 1 && lines.length <= 2, `${role}: subtitles require one or two lines`);
  lines.forEach(line => validateSubtitleLine(line, role));
  requireText(lines.join('') === voiceover, `${role}: subtitle lines must preserve the exact voiceover`);
  for (const line of lines.slice(0, -1)) requireText(BREAKS.includes(line.at(-1)), `${role}: subtitle splits a semantic clause; break only after clause punctuation`);
  for (const token of protectedSubtitleTokens(players, strategies, cue)) {
    const occurrences = text => text.split(token).length - 1;
    requireText(lines.reduce((sum, line) => sum + occurrences(line), 0) === occurrences(voiceover), `${role}: subtitle splits protected current-case token or clause: ${token}`);
  }
}
