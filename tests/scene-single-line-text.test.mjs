import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {ROOT} from '../scripts/python.mjs';
import {readJSON, validateScenes, validateTimeline} from '../scripts/validate-data.mjs';

const scenes = readJSON(path.join(ROOT, 'design/scenes.json'));
const fields = [
  ['caseName'],
  ...scenes.frames.flatMap((_, index) =>
    ['chapter', 'section', 'title', 'lead', 'subtitle'].map(field => ['frames', index, field])),
];
const set = (data, keys, value) => {
  const target = keys.slice(0, -1).reduce((object, key) => object[key], data);
  target[keys.at(-1)] = value;
};
const controls = [...Array.from({length: 32}, (_, i) => i), ...Array.from({length: 33}, (_, i) => 127 + i)];
const invalid = [
  '', ' ', '\u3000\u00a0', ' 甲', '乙\u3000',
  ...controls.map(point => `甲${String.fromCodePoint(point)}乙`),
  ...[0x2028, 0x2029, 0x200b, 0x200e, 0x202e, 0x2066, 0xfeff, 0x034f, 0x3164]
    .map(point => `甲${String.fromCodePoint(point)}乙`),
  '\u3164', '\u2800', '\u0301', '\uD800', '\uE000', '\u{1C89}',
];

for (const keys of fields) test(`scene single-line display rejects hidden and broken text: ${keys.join('.')}`, () => {
  for (const value of invalid) {
    const changed = structuredClone(scenes);
    set(changed, keys, value);
    assert.throws(() => validateScenes(changed), undefined, `${keys.join('.')}: ${JSON.stringify(value)}`);
  }
});

test('frame title newline reproduction fails with a field-specific Unicode contract error', () => {
  const changed = structuredClone(scenes);
  changed.frames[0].title = '甲\n乙';
  assert.throws(() => validateScenes(changed), /Scene participants\.title: label must.*single-line/);
});

test('single-line display validation preserves authored Unicode, templates, spaces and long text', () => {
  const changed = structuredClone(scenes);
  // These are content-validation checks; long lines still need renderer fit QA.
  for (const keys of fields) set(changed, keys, '甲'.repeat(23) + '，{actorA} e\u0301 Ａ\u00a0 B');
  const before = structuredClone(changed);
  assert.doesNotThrow(() => validateScenes(changed));
  assert.deepEqual(changed, before);
});

test('real timeline multiline subtitles retain their explicit line breaks', () => {
  const timeline = readJSON(path.join(ROOT, 'chapters/01-four-elements/narration/timeline.json'));
  const multiline = timeline.segments.filter(segment => segment.lines.length === 2);
  assert(multiline.length > 0, 'fixture must exercise actual multiline subtitles');
  for (const segment of multiline) assert.equal(segment.text, segment.lines.join('\n'));
  assert.doesNotThrow(() => validateTimeline(timeline, scenes));
});

test('metadata and unimplemented next-chapter examples are not blanket-treated as rendered lines', () => {
  const changed = structuredClone(scenes);
  changed.caseId = 'metadata\nidentifier';
  changed.nextChapterExample.title = '未来示例\n尚无渲染器';
  assert.doesNotThrow(() => validateScenes(changed));
});
