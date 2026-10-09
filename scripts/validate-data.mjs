import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import {ROOT} from './python.mjs';
import {normalizedLabel, validateSubtitleLines} from './text-contract.mjs';

const ajv = new Ajv({allErrors: true, strict: true});
const validators = new Map();
export const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export function validateSchema(kind, data) {
  if (!validators.has(kind)) validators.set(kind, ajv.compile(readJSON(path.join(ROOT, `schemas/${kind}.schema.json`))));
  const validate = validators.get(kind);
  assert(validate(data), `${kind}: ${JSON.stringify(validate.errors)}`);
}
export const close = (a, b) => assert(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
export function validateScenes(scenes) {
  validateSchema('scenes', scenes);
  assert.deepEqual(scenes.actors.map(x => x.id), ['A', 'B']);
  assert.deepEqual(scenes.strategies.map(x => x.id), ['red', 'blue']);
  assert.deepEqual(scenes.frames.map(x => x.id), ['participants', 'payoff']);
  assert.equal(scenes.selected.actorA, scenes.strategies[scenes.selected.row].id);
  assert.equal(scenes.selected.actorB, scenes.strategies[scenes.selected.column].id);
  assert.equal(new Set(scenes.actors.map(x => normalizedLabel(x.label, 'Player'))).size, 2, 'Player visible labels must differ');
  assert.equal(new Set(scenes.strategies.map(x => normalizedLabel(x.label, 'Strategy'))).size, 2, 'Strategy visible labels must differ');
}
export function validateTimeline(timeline, scenes) {
  validateScenes(scenes);
  validateSchema('timeline', timeline);
  const labels = scenes.actors.map(actor => actor.label);
  const values = Object.fromEntries(['RR', 'RB', 'BR', 'BB'].map((key, i) => [key, scenes.payoffs[Math.floor(i / 2)][i % 2]]));
  assert.deepEqual(timeline.visual_contract.matrix_values, values);
  assert.deepEqual(timeline.visual_contract.matrix_score_order, labels);
  assert.deepEqual(timeline.visual_contract.participants, labels);
  assert.equal(timeline.visual_contract.game_rounds, 1);
  assert.equal(timeline.segments[0].start, 0);
  close(timeline.segments.at(-1).end, timeline.duration);
  assert.equal(new Set(timeline.segments.map(s => s.id)).size, timeline.segments.length, 'Duplicate segment ids');
  assert.equal(new Set(timeline.sections.map(s => s.id)).size, timeline.sections.length, 'Duplicate section ids');
  for (const [i, s] of timeline.segments.entries()) {
    close(s.end, s.voiceover_end + s.pause_after);
    close(s.voiceover_end, s.start + s.spoken_duration);
    close(s.display_duration, s.end - s.start);
    if (i) close(timeline.segments[i - 1].end, s.start);
    assert.equal(s.lines.join('\n'), s.text);
    validateSubtitleLines(s.lines, s.voiceover, labels, scenes.strategies.map(strategy => strategy.label), s.visual_cue, s.id);
    assert(s.breath_points.every(breath => s.voiceover.includes(breath)), `${s.id}: breath point not in voiceover`);
    const section = timeline.sections.find(section => section.id === s.section);
    assert(section && s.start >= section.start && s.end <= section.end);
    const cue = s.visual_cue;
    if(cue.action==='reveal_scores')assert.deepEqual(cue.score_reveals.map(event=>event.player).sort(),['A','B'],`${s.id}: a complete cell reveal requires one event per player; storage order is irrelevant`);
    if (cue.matrix_cell) assert(Object.hasOwn(values, cue.matrix_cell), `${s.id}: unknown matrix cell`);
    if (cue.choices) {
      assert(cue.matrix_cell, `${s.id}: choices need a matrix cell`);
      assert.deepEqual(cue.choices, {A: scenes.strategies[cue.matrix_cell[0] === 'R' ? 0 : 1].label, B: scenes.strategies[cue.matrix_cell[1] === 'R' ? 0 : 1].label});
    }
    if (cue.scores || cue.score_reveals) {
      assert.deepEqual(cue.scores, values[cue.matrix_cell], `${s.id}: scores do not match the matrix`);
      for (const reveal of cue.score_reveals ?? []) {
        assert(['A', 'B'].includes(reveal.player), `${s.id}: invalid score owner`);
        assert(reveal.offset >= 0 && reveal.offset <= s.spoken_duration);
        assert.equal(reveal.value, cue.scores[reveal.player === 'A' ? 0 : 1]);
      }
    }
  }
  for (const [i, section] of timeline.sections.entries()) {
    if (i) close(timeline.sections[i - 1].end, section.start);
    const segments = timeline.segments.filter(s => s.section === section.id);
    assert(segments.length, `${section.id}: empty section`);
    close(section.start, segments[0].start);
    close(section.end, segments.at(-1).end);
  }
  close(timeline.sections[0].start, 0);
  close(timeline.sections.at(-1).end, timeline.duration);
}
