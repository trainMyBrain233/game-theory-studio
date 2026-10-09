import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {ROOT, pythonCommand} from '../scripts/python.mjs';
import {readJSON, validateTimeline} from '../scripts/validate-data.mjs';
import {validateSubtitleLines, protectedSubtitleTokens} from '../scripts/text-contract.mjs';

const players = ['甲方', '乙方'], strategies = ['合作', '退出'];
const choice = {action: 'highlight_choices', choices: {A: '合作', B: '退出'}};
const score = {action: 'reveal_scores', scores: [27, 31]};
const samples = [
  {cue: choice, lines: ['甲方选择合作，', '乙方也选择退出。']},
  {cue: choice, lines: ['看这次，乙方决定选退出；', '现在甲方选了合作。']},
  {cue: score, lines: ['乙方获得三十一分；', '甲方，拿到二十七分。']},
  {cue: score, lines: ['现在甲方也得到了二十七分，', '而乙方得三十一分。']},
  ...['两个人', '两人', '双方', '他们'].map(subject => ({cue: {...score, scores: [27, 27]}, lines: [`${subject}，各得二十七分。`]})),
  {players: ['甲.方', '乙+方'], cue: choice, lines: ['甲.方选择合作，乙+方选择退出。']},
  {players: ['甲，方', '乙方'], cue: choice, lines: ['甲，方选择合作，乙方选择退出。']},
  {cue: {}, lines: ['这是一句完全自由的讲解。']},
  {cue: choice, lines: ['小A选红，小B选蓝。'], invalid: true},
  {cue: choice, lines: ['甲方选红，乙方选蓝。'], invalid: true},
  {cue: choice, lines: ['甲方选择退出，乙方选择合作。'], invalid: true},
  {cue: choice, lines: ['甲方没有选择合作，乙方选择退出。'], invalid: true},
  {cue: choice, lines: ['甲方选择合作。'], invalid: true},
  {cue: choice, lines: ['甲方，', '选择合作，乙方选择退出。'], invalid: true, split: true},
  {cue: choice, lines: ['甲方选择合作，甲方，', '选择合作，乙方选退出。'], invalid: true, split: true},
  {cue: score, lines: ['小A得零分，小B得五分。'], invalid: true},
  {cue: score, lines: ['甲方得零分，乙方得五分。'], invalid: true},
  {cue: score, lines: ['甲方得三十一分，乙方得二十七分。'], invalid: true},
  {cue: score, lines: ['两个人，各得二十七分。'], invalid: true},
  {cue: score, lines: ['甲方得二十七分。'], invalid: true},
  {cue: {...score, scores: [3, 3]}, lines: ['两人各得十三分。'], invalid: true},
  {players: ['甲.方', '乙+方'], cue: choice, lines: ['甲X方选择合作，乙乙方选择退出。'], invalid: true},
];

test('current-cue clauses accept varied wording and reject stale/missing owners and values in JS/Python', () => {
  const inputs = samples.map(sample => ({players, strategies, ...sample}));
  const js = inputs.map(sample => {
    try {validateSubtitleLines(sample.lines, sample.lines.join(''), sample.players, sample.strategies, sample.cue); return 'accepted';}
    catch (error) {return error.message;}
  });
  inputs.forEach((sample, index) => sample.invalid ? assert.match(js[index], sample.split ? /splits protected/ : /missing current-case/) : assert.equal(js[index], 'accepted'));
  const code = `import json,sys
sys.path.insert(0,'scripts')
from text_contract import validate_subtitle_lines
out=[]
for sample in json.load(sys.stdin):
    try:
        validate_subtitle_lines(sample['lines'], ''.join(sample['lines']), sample['players'], sample['strategies'], sample['cue'])
        out.append('accepted')
    except ValueError as error: out.append(str(error))
print(json.dumps(out))`;
  for (const flags of [[], ['-O'], ['-OO']]) {
    const result = spawnSync(pythonCommand(), [...flags, '-c', code], {cwd: ROOT, input: JSON.stringify(inputs), encoding: 'utf8', env: {...process.env, PYTHON: pythonCommand()}});
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), js);
  }
});

test('current metadata and cues cannot legitimize paired stale voiceover and subtitles with zero current token occurrences', () => {
  const scenes = readJSON(path.join(ROOT, 'design/scenes.json'));
  const timeline = readJSON(path.join(ROOT, 'chapters/01-four-elements/narration/timeline.json'));
  scenes.actors.forEach((actor, index) => {actor.label = players[index];});
  scenes.strategies.forEach((strategy, index) => {strategy.label = strategies[index];});
  scenes.payoffs = [[[27, 31], [28, 32]], [[29, 33], [30, 34]]];
  timeline.visual_contract.participants = timeline.visual_contract.matrix_score_order = players;
  timeline.visual_contract.matrix_values = Object.fromEntries(['RR', 'RB', 'BR', 'BB'].map((cell, index) => [cell, scenes.payoffs[Math.floor(index / 2)][index % 2]]));
  for (const segment of timeline.segments) {
    const cue = segment.visual_cue;
    if (cue.choices) cue.choices = {A: strategies[cue.matrix_cell[0] === 'R' ? 0 : 1], B: strategies[cue.matrix_cell[1] === 'R' ? 0 : 1]};
    if (cue.scores) {
      cue.scores = timeline.visual_contract.matrix_values[cue.matrix_cell];
      cue.score_reveals.forEach(event => {event.value = cue.scores[event.player === 'A' ? 0 : 1];});
    }
  }
  // Replace every semantic segment's paired text, so the fixture remains stale
  // even when test:case-reuse has rebuilt the repository with different data.
  for (const segment of timeline.segments) {
    const cue = segment.visual_cue;
    if (!['highlight_choices', 'reveal_scores'].includes(cue.action)) continue;
    segment.voiceover = cue.action === 'highlight_choices' ? '小A选红，小B选蓝。' : '小A得零分，小B得五分。';
    segment.lines = [segment.voiceover]; segment.text = segment.voiceover; segment.breath_points = [];
    for (const token of protectedSubtitleTokens(players, strategies, cue)) assert.equal(segment.voiceover.split(token).length - 1, 0);
  }
  assert.throws(() => validateTimeline(timeline, scenes), /missing current-case A choice/);
  // Isolate stale scores too, instead of stopping at the first stale choice.
  for (const segment of timeline.segments.filter(segment => segment.visual_cue.choices)) {
    const cue = segment.visual_cue;
    segment.voiceover = `${players[0]}选${cue.choices.A}，${players[1]}选${cue.choices.B}。`;
    segment.lines = [segment.voiceover]; segment.text = segment.voiceover;
  }
  assert.throws(() => validateTimeline(timeline, scenes), /missing current-case A score/);
});
