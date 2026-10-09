import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {ROOT, pythonCommand} from '../scripts/python.mjs';
import {readJSON, validateTimeline, validateFirstEpisodeTimeline} from '../scripts/validate-data.mjs';

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
    for (const relative of [builder, ...['narration_validation.py', 'narration_io.py', 'case_data.py', 'text_contract.py',
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
      validateFirstEpisodeTimeline(fixture.timeline, fixture.scenes);
      assert.deepEqual(cells.map(cell => scoreSegment(fixture.timeline, cell).visual_cue.scores), fixture.scenes.payoffs.flat());
      for (const reverse of [false, true]) {
        const document = structuredClone(fixture.timeline);
        for (const cell of cells) {
          const segment = scoreSegment(document, cell);
          segment.visual_cue.score_reveals[0].offset = 0;
          segment.visual_cue.score_reveals[1].offset = segment.spoken_duration;
          if (reverse) segment.visual_cue.score_reveals.reverse();
        }
        validateFirstEpisodeTimeline(document, fixture.scenes);
      }
    });
    await t.test('notes without score, choice or matrix payloads remain valid', () => {
      const document = structuredClone(fixture.timeline);
      document.segments[0].visual_cue = {action: 'note', note: '只显示说明。'};
      validateFirstEpisodeTimeline(document, fixture.scenes);
    });
    for (const cell of cells) {
      for (const action of ['note', 'show_two_actions']) {
        await t.test(`${cell} rejects choices carried by ${action}`, () => {
          const document = structuredClone(fixture.timeline);
          const segment = document.segments.find(segment => segment.visual_cue.action === 'highlight_choices' && segment.visual_cue.matrix_cell === cell);
          segment.visual_cue.action = action;
          assert.throws(() => validateTimeline(document, fixture.scenes), /choices require action highlight_choices/);
        });
      }
      for (const action of ['highlight_choices', 'reveal_scores']) {
        await t.test(`${cell} requires one ${action}, even when its entire cue is removed`, () => {
          const document = structuredClone(fixture.timeline);
          const segment = document.segments.find(segment => segment.visual_cue.action === action && segment.visual_cue.matrix_cell === cell);
          segment.visual_cue = {action: 'note'};
          validateTimeline(document, fixture.scenes); // Still a valid generic chapter.
          assert.throws(() => validateFirstEpisodeTimeline(document, fixture.scenes), new RegExp(`exactly one ${action} for ${cell}`));
        });
        await t.test(`${cell} rejects duplicated ${action} under a different segment ID`, () => {
          const document = structuredClone(fixture.timeline);
          const segment = document.segments.find(segment => segment.visual_cue.action === action && segment.visual_cue.matrix_cell === cell);
          document.segments[0].visual_cue = structuredClone(segment.visual_cue);
          validateTimeline(document, fixture.scenes);
          assert.throws(() => validateFirstEpisodeTimeline(document, fixture.scenes), new RegExp(`exactly one ${action} for ${cell}`));
        });
      }
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
    await t.test('matrix-only notes cannot silently change first-episode focus', () => {
      const document = structuredClone(fixture.timeline);
      document.segments[0].visual_cue = {action: 'note', matrix_cell: 'RR'};
      validateTimeline(document, fixture.scenes);
      assert.throws(() => validateFirstEpisodeTimeline(document, fixture.scenes), /matrix cues must be unique choice\/reveal pairs/);
    });
    await t.test('valid retiming and reordered score events retain the fixed semantic structure', () => {
      const document = structuredClone(fixture.timeline);
      const scale = 1.3;
      document.duration *= scale;
      for (const section of document.sections) {
        section.start *= scale;
        section.end *= scale;
      }
      for (const segment of document.segments) {
        for (const field of ['start', 'end', 'voiceover_end', 'spoken_duration', 'pause_after', 'display_duration']) segment[field] *= scale;
        for (const event of segment.visual_cue.score_reveals ?? []) event.offset *= scale;
        segment.visual_cue.score_reveals?.reverse();
      }
      validateFirstEpisodeTimeline(document, fixture.scenes);
    });
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

test('highlight_choices requires its complete payload in any chapter', () => {
  for (const field of ['choices', 'matrix_cell']) {
    const document = structuredClone(timeline);
    delete document.segments.find(segment => segment.visual_cue.action === 'highlight_choices').visual_cue[field];
    assert.throws(() => validateTimeline(document, scenes), /highlight_choices requires|choices need a matrix cell/);
  }
});

test('generic two-block chapters remain valid without the first-episode matrix walkthrough', () => {
  const original = readJSON(path.join(ROOT, 'chapters/00-original-example/narration/timeline.json'));
  validateTimeline(original, scenes);
  assert.equal(original.segments.filter(segment => segment.visual_cue.action === 'reveal_scores').length, 1);
  const withoutScores = structuredClone(original);
  withoutScores.segments[1].visual_cue = {action: 'note'};
  validateTimeline(withoutScores, scenes);
});

// Read literal consumers without importing any Canvas/font/character modules.
const rendererAnchors = [...new Set([
  'production/src/scenes.mjs', 'production/src/choreography.mjs',
  'production/src/character_adapter.mjs', 'production/src/checkpoints.mjs',
  // Timing helpers are live renderer consumers too, even after extraction from scenes.
  'production/src/comparison-timing.mjs', 'production/src/payoff-entry-timing.mjs',
  'production/src/payoff-recap-timing.mjs'
].flatMap(relative => [...fs.readFileSync(path.join(ROOT, relative), 'utf8').matchAll(/'(s\d\d_[a-z_]+)'/g)].map(match => match[1])))];

test('every actual renderer/checkpoint anchor rejects omission, renaming and duplicate IDs', () => {
  assert(rendererAnchors.length >= 20, 'The audit must inspect the real literal consumers.');
  for (const id of rendererAnchors) {
    const renamed = structuredClone(timeline);
    renamed.segments.find(segment => segment.id === id).id = 'renamed_anchor';
    validateTimeline(renamed, scenes);
    assert.throws(() => validateFirstEpisodeTimeline(renamed, scenes), new RegExp(`exactly one segment anchor: ${id}`));

    const missing = structuredClone(timeline);
    const index = missing.segments.findIndex(segment => segment.id === id);
    const [removed] = missing.segments.splice(index, 1);
    const next = missing.segments[index];
    if (next?.section === removed.section) {
      next.start = removed.start;
      next.spoken_duration = next.voiceover_end - next.start;
      next.display_duration = next.end - next.start;
    } else {
      const previous = missing.segments[index - 1];
      previous.end = removed.end;
      previous.pause_after = previous.end - previous.voiceover_end;
      previous.display_duration = previous.end - previous.start;
    }
    validateTimeline(missing, scenes);
    assert.throws(() => validateFirstEpisodeTimeline(missing, scenes), new RegExp(`exactly one segment anchor: ${id}`));

    const duplicate = structuredClone(timeline);
    duplicate.segments.find(segment => segment.id !== id).id = id;
    assert.throws(() => validateFirstEpisodeTimeline(duplicate, scenes), /Duplicate segment ids/);
  }
});

test('fixed sections, anchor ownership and walkthrough order reject silent changes', () => {
  for (const section of timeline.sections) {
    const document = structuredClone(timeline);
    document.sections.find(item => item.id === section.id).id = 'renamed_section';
    for (const segment of document.segments.filter(item => item.section === section.id)) segment.section = 'renamed_section';
    validateTimeline(document, scenes);
    assert.throws(() => validateFirstEpisodeTimeline(document, scenes), /six supported sections/);
  }
  const reordered = structuredClone(timeline);
  const a = reordered.segments.find(segment => segment.id === 's08_known_unknown');
  const b = reordered.segments.find(segment => segment.id === 's09_simultaneous');
  [a.id, b.id] = [b.id, a.id];
  assert.throws(() => validateFirstEpisodeTimeline(reordered, scenes), /anchors must retain their order/);

  const wrongSection = structuredClone(timeline);
  const hook = wrongSection.segments.find(segment => segment.id === 's01_hook');
  const goal = wrongSection.segments.find(segment => segment.id === 's05_goal');
  [hook.id, goal.id] = [goal.id, hook.id];
  assert.throws(() => validateFirstEpisodeTimeline(wrongSection, scenes), /anchor belongs in intro/);

  const reversed = structuredClone(timeline);
  const choice = reversed.segments.find(segment => segment.visual_cue.action === 'highlight_choices');
  const score = scoreSegment(reversed, 'RR');
  [choice.visual_cue, score.visual_cue] = [score.visual_cue, choice.visual_cue];
  [choice.id, score.id] = [score.id, choice.id];
  validateTimeline(reversed, scenes);
  assert.throws(() => validateFirstEpisodeTimeline(reversed, scenes), /matrix cues must be unique choice\/reveal pairs/);

  const declared = structuredClone(timeline);
  declared.visual_contract.matrix_reveal_order.reverse();
  assert.throws(() => validateFirstEpisodeTimeline(declared, scenes), /matrix reveal order/);
});

test('recap layout anchor stays in recap before the paired summaries', () => {
  validateFirstEpisodeTimeline(timeline, scenes);
  for (const [otherId, expected] of [
    ['s35_first_pair', /anchors must retain their order/],
    ['s03_question', /anchor belongs in recap/],
  ]) {
    const document = structuredClone(timeline);
    const intro = document.segments.find(segment => segment.id === 's34_intro');
    const other = document.segments.find(segment => segment.id === otherId);
    assert(other, `Fixture must contain ${otherId}`);
    [intro.id, other.id] = [other.id, intro.id];
    validateTimeline(document, scenes);
    assert.throws(() => validateFirstEpisodeTimeline(document, scenes), expected);
  }
});

test('production model and qa:data apply the first-episode contract before rendering or rebuilding', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'episode-model-contract-'));
  try {
    for (const relative of ['production/src/model.mjs', 'production/src/palette.mjs', 'production/assets/asset-hotspots.json', 'design/text-contrast.mjs', 'production/cast.json', 'production/content.json', 'production/tokens.json',
      'production/schema/cast.schema.json', 'production/schema/content.schema.json', 'production/schema/tokens.schema.json',
      'design/scenes.json', 'design/tokens.json', 'schemas/scenes.schema.json', 'schemas/timeline.schema.json', 'schemas/tokens.schema.json', 'schemas/chapter.schema.json',
      'scripts/qa-data.mjs', 'scripts/chapters.mjs', 'scripts/validate-data.mjs', 'scripts/python.mjs', 'scripts/text-contract.mjs', 'scripts/unicode-text-15.0.0.json',
      'chapters/01-four-elements/chapter.json', 'chapters/01-four-elements/narration/timeline.json']) {
      fs.mkdirSync(path.dirname(path.join(temporary, relative)), {recursive: true});
      fs.copyFileSync(path.join(ROOT, relative), path.join(temporary, relative));
    }
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(temporary, 'node_modules'), 'dir');
    const runModel = () => spawnSync(process.execPath, ['production/src/model.mjs'], {cwd: temporary, encoding: 'utf8'});
    assert.equal(runModel().status, 0, 'The unchanged model loads without Canvas or fonts.');
    for (const action of ['highlight_choices', 'reveal_scores', 'recap_anchor']) {
      const document = structuredClone(timeline);
      const expected = action === 'recap_anchor'
        ? /exactly one segment anchor: s34_intro/
        : new RegExp(`exactly one ${action} for RR`);
      if (action === 'recap_anchor') document.segments.find(segment => segment.id === 's34_intro').id = 'renamed_recap';
      else document.segments.find(segment => segment.visual_cue.action === action && segment.visual_cue.matrix_cell === 'RR').visual_cue = {action: 'note'};
      validateTimeline(document, scenes);
      fs.writeFileSync(path.join(temporary, 'chapters/01-four-elements/narration/timeline.json'), JSON.stringify(document));
      for (const script of ['production/src/model.mjs', 'scripts/qa-data.mjs']) {
        const result = spawnSync(process.execPath, [script], {cwd: temporary, encoding: 'utf8'});
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, expected);
      }
    }
  } finally {
    fs.rmSync(temporary, {recursive: true, force: true});
  }
});
