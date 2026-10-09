import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {ROOT, pythonCommand} from '../scripts/python.mjs';
import {readJSON, validateTimeline} from '../scripts/validate-data.mjs';

const scenes = readJSON(path.join(ROOT, 'design/scenes.json'));
const timeline = readJSON(path.join(ROOT, 'chapters/01-four-elements/narration/timeline.json'));
const cells = ['RR', 'RB', 'BR', 'BB'];
const scoreSegment = (document, cell) => document.segments.find(segment =>
  segment.visual_cue.action === 'reveal_scores' && segment.visual_cue.matrix_cell === cell);

function changedCase() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'score-action-case-'));
  try {
    // Rebuild real narration with public source only; no Canvas, fonts or rendering.
    const builder = 'chapters/01-four-elements/narration/build_narration.py';
    for (const relative of [builder, ...['narration_io.py', 'case_data.py', 'text_contract.py',
      'unicode-text-15.0.0.json'].map(name => `scripts/${name}`)]) {
      fs.mkdirSync(path.dirname(path.join(temporary, relative)), {recursive: true});
      fs.copyFileSync(path.join(ROOT, relative), path.join(temporary, relative));
    }
    const changed = structuredClone(scenes);
    changed.actors[0].label = '欧阳小明';
    changed.actors[1].label = '司马小红';
    changed.strategies[0].label = '合作';
    changed.strategies[1].label = '退出';
    changed.payoffs = [[[11, 12], [21, 22]], [[31, 32], [41, 42]]];
    changed.selected = {row: 1, column: 0, actorA: 'blue', actorB: 'red'};
    fs.mkdirSync(path.join(temporary, 'design'));
    fs.writeFileSync(path.join(temporary, 'design/scenes.json'), JSON.stringify(changed));
    const built = spawnSync(pythonCommand(), [path.join(temporary, builder)], {encoding: 'utf8'});
    assert.equal(built.status, 0, built.stdout + built.stderr);
    return {scenes: changed, timeline: readJSON(path.join(temporary, path.dirname(builder), 'timeline.json'))};
  } finally {
    fs.rmSync(temporary, {recursive: true, force: true});
  }
}

for (const name of ['default', 'rebuilt changed']) {
  test(`${name} timeline enforces score action and payload together`, async t => {
    const fixture = name === 'default' ? {scenes, timeline} : changedCase();
    await t.test('all four complete reveals accept either storage order and speech-window boundaries', () => {
      validateTimeline(fixture.timeline, fixture.scenes);
      assert.deepEqual(cells.map(cell => scoreSegment(fixture.timeline, cell).visual_cue.scores), fixture.scenes.payoffs.flat());
      for (const reverse of [false, true]) {
        const document = structuredClone(fixture.timeline);
        for (const cell of cells) {
          const segment = scoreSegment(document, cell);
          segment.visual_cue.score_reveals[0].offset = 0;
          segment.visual_cue.score_reveals[1].offset = segment.spoken_duration;
          if (reverse) segment.visual_cue.score_reveals.reverse();
        }
        validateTimeline(document, fixture.scenes);
      }
    });
    await t.test('note cues without scores remain valid with or without choices and matrix cells', () => {
      const document = structuredClone(fixture.timeline);
      document.segments[0].visual_cue = {action: 'note', note: '只显示说明。'};
      for (const segment of document.segments.filter(segment => segment.visual_cue.action === 'highlight_choices')) {
        segment.visual_cue.action = 'note';
      }
      validateTimeline(document, fixture.scenes);
    });
    for (const cell of cells) {
      for (const action of ['note', 'highlight_choices']) {
        for (const payload of ['scores and events', 'scores only', 'events only']) {
          await t.test(`${cell} rejects ${action} with ${payload}`, () => {
            const document = structuredClone(fixture.timeline);
            const segment = scoreSegment(document, cell);
            segment.visual_cue.action = action;
            if (payload === 'scores only') delete segment.visual_cue.score_reveals;
            if (payload === 'events only') delete segment.visual_cue.scores;
            assert.throws(() => validateTimeline(document, fixture.scenes), {
              message: new RegExp(`${segment.id}: scores and score_reveals require action reveal_scores`)
            });
          });
        }
      }
    }
    for (const [label, mutate] of [
      ['missing cell', cue => { delete cue.matrix_cell; }],
      ['missing scores', cue => { delete cue.scores; }],
      ['missing events', cue => { delete cue.score_reveals; }],
      ['empty events', cue => { cue.score_reveals = []; }],
      ['single event', cue => { cue.score_reveals.pop(); }],
      ['duplicate owner', cue => { cue.score_reveals[1].player = cue.score_reveals[0].player; }],
      ['unknown owner', cue => { cue.score_reveals[0].player = 'C'; }],
      ['wrong score', cue => { cue.scores[0] = (cue.scores[0] + 1) % 100; }],
      ['wrong event value', cue => { cue.score_reveals[0].value = (cue.score_reveals[0].value + 1) % 100; }],
      ['late event', (cue, segment) => { cue.score_reveals[0].offset = segment.spoken_duration + 0.1; }]
    ]) {
      await t.test(`complete reveal still rejects ${label} for every cell`, () => {
        for (const cell of cells) {
          const document = structuredClone(fixture.timeline);
          const segment = scoreSegment(document, cell);
          mutate(segment.visual_cue, segment);
          assert.throws(() => validateTimeline(document, fixture.scenes), undefined, cell);
        }
      });
    }
  });
}
