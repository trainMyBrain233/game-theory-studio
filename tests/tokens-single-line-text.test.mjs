import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {ROOT} from '../scripts/python.mjs';
import {readJSON, validateSchema} from '../scripts/validate-data.mjs';
import {comparisonBoardTextPlan} from '../design/comparison-board-text.mjs';

const tokens = readJSON(path.join(ROOT, 'design/tokens.json'));
const controls = [...Array.from({length: 32}, (_, i) => i), ...Array.from({length: 33}, (_, i) => 127 + i)];
const invalid = [
  '', ' ', '\u3000\u00a0', ' 甲', '乙\u3000',
  ...controls.map(point => `甲${String.fromCodePoint(point)}乙`),
  ...[0x2028, 0x2029, 0x200b, 0x200e, 0x202e, 0x2066, 0xfeff, 0x034f, 0x3164]
    .map(point => `甲${String.fromCodePoint(point)}乙`),
  '\u3164', '\u2800', '\u0301', '\uD800', '\uE000', '\u{1C89}',
];

for (const id of Object.keys(tokens.styles)) for (const field of ['name', 'subtitle']) {
  test(`token and live comparison plan reject hidden and broken text: ${id}.${field}`, () => {
    for (const value of invalid) {
      const changed = structuredClone(tokens);
      changed.styles[id][field] = value;
      assert.throws(() => validateSchema('tokens', changed), undefined, `${id}.${field}: ${JSON.stringify(value)}`);
      assert.throws(() => comparisonBoardTextPlan(changed.styles[id]), /label must/);
    }
  });
}

test('comparison labels preserve Unicode, punctuation and internal spaces without subtitle length limits', () => {
  const changed = structuredClone(tokens);
  for (const style of Object.values(changed.styles)) {
    style.name = '甲'.repeat(23) + '，e\u0301 Ａ\u00a0 B';
    style.subtitle = '字幕'.repeat(12) + '（中文） × 说明';
  }
  const before = structuredClone(changed);
  assert.doesNotThrow(() => validateSchema('tokens', changed));
  for (const style of Object.values(changed.styles)) {
    assert.deepEqual(comparisonBoardTextPlan(style).slice(0, 2).map(run => run.text), [style.name, style.subtitle]);
  }
  assert.deepEqual(changed, before);
});

test('remaining token text choices are fixed by their existing schema constraints', () => {
  for (const keys of [
    ['font', 'sans'], ['font', 'serif'],
    ['semantic', 'strategyRed', 'name'], ['semantic', 'strategyBlue', 'name'],
    ...Object.keys(tokens.styles).map(id => ['styles', id, 'titleFamily']),
  ]) {
    const changed = structuredClone(tokens);
    const target = keys.slice(0, -1).reduce((object, key) => object[key], changed);
    target[keys.at(-1)] += '\n';
    assert.throws(() => validateSchema('tokens', changed), /tokens:/);
  }
});

test('live comparison renderer rejects invalid style overrides before drawing text', () => {
  const source = `
    import assert from 'node:assert/strict';
    import {TOKENS, drawComparisonHeader} from ${JSON.stringify(new URL('../design/render-proposals.mjs', import.meta.url).href)};
    let draws = 0;
    const canvas = {width: 3840, height: 1320, getContext() {
      return {fillRect() {}, fillText() {draws++;}};
    }};
    for (const id of Object.keys(TOKENS.styles)) for (const field of ['name', 'subtitle']) {
      const style = TOKENS.styles[id], original = style[field];
      try {
        for (const invalid of ['甲\\n乙', '甲\\u0000乙', '\\u3000', '甲\\u200b乙']) {
          style[field] = invalid;
          assert.throws(() => drawComparisonHeader(canvas, id), /label must/);
          assert.equal(draws, 0, 'Invalid single-line text must never reach fillText');
        }
      } finally {style[field] = original;}
    }
  `;
  const result = spawnSync(process.execPath, [
    '--loader', new URL('./fixtures/proposal-header-stubs-loader.mjs', import.meta.url).pathname,
    '--input-type=module', '-e', source,
  ], {cwd: os.tmpdir(), encoding: 'utf8', timeout: 30000});
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
