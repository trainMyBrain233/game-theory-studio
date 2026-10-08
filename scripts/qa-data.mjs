import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import Ajv from 'ajv';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => JSON.parse(fs.readFileSync(path.join(ROOT, relative)));
const ajv = new Ajv({allErrors: true, strict: true});
const scenes = read('design/scenes.json');
const timeline = read('chapters/01-four-elements/narration/timeline.json');
for (const [kind, data] of [['scenes', scenes], ['timeline', timeline]]) {
  const validate = ajv.compile(read(`schemas/${kind}.schema.json`));
  assert(validate(data), JSON.stringify(validate.errors));
  const invalid = structuredClone(data);
  if (kind === 'scenes') invalid.selected.row = 2;
  else invalid.segments[0].end = -1;
  assert(!validate(invalid), `${kind} schema must reject invalid fixtures`);
}
assert.deepEqual(scenes.actors.map(x => x.id), ['A', 'B']);
assert.deepEqual(scenes.strategies.map(x => x.id), ['red', 'blue']);
assert.equal(scenes.selected.actorA, scenes.strategies[scenes.selected.row].id);
assert.equal(scenes.selected.actorB, scenes.strategies[scenes.selected.column].id);
assert.deepEqual(scenes.payoffs, [[[3, 3], [0, 5]], [[5, 0], [1, 1]]]);
assert.deepEqual(timeline.visual_contract.matrix_values, {RR: [3, 3], RB: [0, 5], BR: [5, 0], BB: [1, 1]});
assert.deepEqual(timeline.visual_contract.matrix_score_order, ['小A', '小B']);
assert.equal(timeline.visual_contract.game_rounds, 1);
assert.equal(timeline.duration, 173.3);
assert.equal(timeline.segments.length, 37);
assert.equal(timeline.segments[0].start, 0);
assert.equal(timeline.segments.at(-1).end, timeline.duration);
assert.equal(new Set(timeline.segments.map(s => s.id)).size, timeline.segments.length);
const close = (a, b) => assert(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
for (const [i, s] of timeline.segments.entries()) {
  close(s.end, s.voiceover_end + s.pause_after);
  close(s.voiceover_end, s.start + s.spoken_duration);
  close(s.display_duration, s.end - s.start);
  if (i) close(timeline.segments[i - 1].end, s.start);
  assert.equal(s.lines.join('\n'), s.text);
  assert.equal(s.text.replace(/\s/g, ''), s.voiceover.replace(/\s/g, ''));
  assert(s.lines.every(line => [...line.matchAll(/[\u4e00-\u9fffA-Za-z0-9]/g)].length <= 22));
  const section = timeline.sections.find(section => section.id === s.section);
  assert(section && s.start >= section.start && s.end <= section.end);
  if (s.visual_cue.score_reveals) {
    assert.deepEqual(s.visual_cue.scores, timeline.visual_contract.matrix_values[s.visual_cue.matrix_cell]);
    for (const reveal of s.visual_cue.score_reveals) {
      assert(reveal.offset >= 0 && reveal.offset <= s.spoken_duration);
      assert.equal(reveal.value, s.visual_cue.scores[reveal.player === 'A' ? 0 : 1]);
    }
  }
}
for (const [i, section] of timeline.sections.entries()) {
  if (i) close(timeline.sections[i - 1].end, section.start);
  const segments = timeline.segments.filter(s => s.section === section.id);
  close(section.start, segments[0].start); close(section.end, segments.at(-1).end);
}
// The authored generator must reproduce the tracked text deliverables byte-for-byte.
const outputs = ['timeline.json', 'game_theory_v2_zh.srt', 'voiceover_v2_zh.txt'];
const base = path.join(ROOT, 'chapters/01-four-elements/narration');
const before = outputs.map(file => fs.readFileSync(path.join(base, file)));
const build = spawnSync('python3', [path.join(base, 'build_narration.py')], {encoding: 'utf8'});
assert.equal(build.status, 0, build.stderr);
for (const [i, file] of outputs.entries()) assert.deepEqual(fs.readFileSync(path.join(base, file)), before[i], `${file} is stale; run npm run build:narration and review the changes`);
console.log('Data QA: two schemas, negative fixtures, all matrix values, 37 continuous blocks, 173.3s, timing/score cues, reproducible narration outputs.');

const cast = read('assets/characters/cast.json');
assert.equal(cast.activeCast, null);
assert.equal(cast.roles.A.matrixAxis, 'row');
assert.equal(cast.roles.B.matrixAxis, 'column');
assert.equal(cast.roles.A.payoffIndex, 0);
assert.equal(cast.roles.B.payoffIndex, 1);
assert(Object.values(cast.roles).every(role => role.asset === null));
const archivedCast = read('assets/characters/archive/proposals/cast.json');
assert.equal(archivedCast.status, 'archived_not_selected');
assert.equal(archivedCast.selectedProposal, null);
assert.equal(archivedCast.activeCast, null);
console.log('Cast data: generic A/B roles intact; original proposals archived; no final third-party artwork activated.');
