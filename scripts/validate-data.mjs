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
  // Chapter titles are reused verbatim as README headings and narration titles.
  // Validate here so both scaffold creation (before writes) and qa:data agree.
  if (kind === 'chapter') normalizedLabel(data.title, 'Chapter title');
  if (kind === 'tokens') {
    for (const [id, style] of Object.entries(data.styles)) {
      for (const field of ['name', 'subtitle']) normalizedLabel(style[field], `Tokens styles.${id}.${field}`);
    }
  }
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
  // Each field below reaches a single fillText call in at least one supported
  // proposal style. Automatic wrapping in other styles is not newline support.
  // Reuse the Unicode contract without normalizing the authored display text or
  // imposing the timeline subtitle line's separate 22-readable-character cap.
  normalizedLabel(scenes.caseName, 'Scene caseName');
  for (const frame of scenes.frames) validateSceneText(frame);
}
export function validateSceneText(frame) {
  for (const field of ['chapter', 'section', 'title', 'lead', 'subtitle']) {
    normalizedLabel(frame[field], `Scene ${frame.id}.${field}`);
  }
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
    assert(s.breath_points.every(breath => s.voiceover.includes(breath)), `${s.id}: breath point not in voiceover`);
    const section = timeline.sections.find(section => section.id === s.section);
    assert(section && s.start >= section.start && s.end <= section.end);
    const cue = s.visual_cue;
    // Score payloads must use the same action that production uses to find reveals.
    if (Object.hasOwn(cue, 'scores') || Object.hasOwn(cue, 'score_reveals')) {
      assert.equal(cue.action, 'reveal_scores', `${s.id}: scores and score_reveals require action reveal_scores`);
    }
    if (cue.action === 'reveal_scores') {
      assert.deepEqual(cue.score_reveals.map(event => event.player).sort(), ['A', 'B'], `${s.id}: a complete cell reveal requires one event per player; storage order is irrelevant`);
    }
    if (cue.matrix_cell) assert(Object.hasOwn(values, cue.matrix_cell), `${s.id}: unknown matrix cell`);
    if (cue.choices) {
      assert.equal(cue.action, 'highlight_choices', `${s.id}: choices require action highlight_choices`);
      assert(cue.matrix_cell, `${s.id}: choices need a matrix cell`);
      assert.deepEqual(cue.choices, {A: scenes.strategies[cue.matrix_cell[0] === 'R' ? 0 : 1].label, B: scenes.strategies[cue.matrix_cell[1] === 'R' ? 0 : 1].label});
    }
    if (cue.action === 'highlight_choices') {
      assert(cue.matrix_cell && cue.choices, `${s.id}: highlight_choices requires a matrix cell and both choices`);
    }
    if (cue.scores || cue.score_reveals) {
      assert.deepEqual(cue.scores, values[cue.matrix_cell], `${s.id}: scores do not match the matrix`);
      for (const reveal of cue.score_reveals ?? []) {
        assert(['A', 'B'].includes(reveal.player), `${s.id}: invalid score owner`);
        assert(reveal.offset >= 0 && reveal.offset <= s.spoken_duration);
        // Consumers use this absolute Float64 time in the half-open display
        // window. A relative offset below the duration can still round to end.
        const revealTime = s.start + reveal.offset;
        assert(revealTime >= s.start && revealTime < s.end,
          `${s.id}: score reveal must occur within the segment display window [start, end)`);
        assert.equal(reveal.value, cue.scores[reveal.player === 'A' ? 0 : 1]);
      }
    }
    validateSubtitleLines(s.lines, s.voiceover, labels, scenes.strategies.map(strategy => strategy.label), s.visual_cue, s.id);
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

// The fixed first-episode renderer is a complete semantic sequence, not just
// its literal ID lookups: section-start states also draw the question/setup
// segments, and matrix focus consumes the choice cues. Generic chapters and
// the two-block scaffold deliberately use validateTimeline instead. Retiming
// and A/B event storage order are flexible; semantic block order is not.
const FIRST_EPISODE_ANCHORS = {
  intro: ['s01_hook', 's02_four_questions'],
  players: ['s03_question', 's04_setup', 's05_goal', 's06_definition'],
  information: ['s07_question', 's08_known_unknown', 's09_simultaneous', 's10_distinction', 's11_timing'],
  strategy: ['s12_question', 's13_options', 's14_simple_case', 's15_definition', 's16_comparison_intro', 's17_comparison_example', 's18_return_single_round'],
  payoffs: ['s19_question', 's20_definition', 's21_rows', 's22_columns', 's23_score_order', 's24_rr_select', 's25_rr_score', 's26_rb_select', 's27_rb_score', 's28_br_select', 's29_br_score', 's30_bb_select', 's31_bb_score', 's32_joint_choices', 's33_beyond_money'],
  recap: ['s34_intro', 's35_first_pair', 's36_second_pair', 's37_closing'],
};
const FIRST_EPISODE_SCORES = {RR: 's25_rr_score', RB: 's27_rb_score', BR: 's29_br_score', BB: 's31_bb_score'};

/** Validate every fixed lookup in scenes, choreography, actors and checkpoints. */
export function validateFirstEpisodeTimeline(timeline, scenes) {
  validateTimeline(timeline, scenes);
  assert.deepEqual(timeline.sections.map(section => section.id), Object.keys(FIRST_EPISODE_ANCHORS), 'First episode requires the six supported sections in order');
  for (const [section, ids] of Object.entries(FIRST_EPISODE_ANCHORS)) {
    let previous = -1;
    for (const id of ids) {
      const matches = timeline.segments.filter(segment => segment.id === id);
      assert.equal(matches.length, 1, `First episode requires exactly one segment anchor: ${id}`);
      const segment = matches[0];
      assert.equal(segment.section, section, `${id}: first-episode anchor belongs in ${section}`);
      assert(segment.start > previous, `${id}: first-episode anchors must retain their order`);
      previous = segment.start;
    }
    assert.deepEqual(timeline.segments.filter(segment => segment.section === section).map(segment => segment.id), ids,
      `${section}: first-episode section must contain only its supported semantic anchors`);
  }
  const cells = Object.keys(FIRST_EPISODE_SCORES);
  assert.deepEqual(timeline.visual_contract.matrix_reveal_order, cells, 'First episode matrix reveal order must match its fixed walkthrough');
  const summary = timeline.segments.find(segment => segment.id === 's32_joint_choices');
  const order = timeline.segments.find(segment => segment.id === 's23_score_order');
  const expected = [];
  for (const cell of cells) {
    for (const action of ['highlight_choices', 'reveal_scores']) {
      const matches = timeline.segments.filter(segment => segment.visual_cue.action === action && segment.visual_cue.matrix_cell === cell);
      assert.equal(matches.length, 1, `First episode requires exactly one ${action} for ${cell}`);
      const segment = matches[0];
      assert.equal(segment.section, 'payoffs', `${segment.id}: matrix walkthrough belongs in payoffs`);
      assert(segment.start >= order.end && segment.end <= summary.start, `${segment.id}: matrix walkthrough must follow score order and finish before summary`);
      if (action === 'reveal_scores') assert.equal(segment.id, FIRST_EPISODE_SCORES[cell], `${cell}: score reveal must match its checkpoint anchor`);
      expected.push([action, cell]);
    }
  }
  // currentCell uses every matrix_cell, so even a payload-free note with a cell
  // would change focus. Require the same unique choice/reveal sequence it draws.
  const actual = timeline.segments.filter(segment => segment.visual_cue.matrix_cell)
    .map(segment => [segment.visual_cue.action, segment.visual_cue.matrix_cell]);
  assert.deepEqual(actual, expected, 'First episode matrix cues must be unique choice/reveal pairs in walkthrough order');
}
