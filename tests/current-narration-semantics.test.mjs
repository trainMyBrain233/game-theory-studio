import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
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
  ...[
    ['introduce_players', '假设乙方和甲方，玩一轮积分游戏。', '假设小A和小B，玩一轮积分游戏。'],
    ['show_two_actions', '看这里，每人可以选择退出牌或合作牌。', '每人可以选红牌或蓝牌。'],
    ['map_actions_to_pure_strategies', '退出与合作是两种纯策略。', '红和蓝就是两个纯策略。'],
    ['show_multi_round_plan', '比如，第一轮选择合作；以后再决定。', '第一轮选红；以后再决定。'],
    ['introduce_matrix_rows', '看这张表：甲方的选择对应行。', '行，是乙方的选择。'],
    ['introduce_matrix_columns', '列，代表乙方的选择。', '列，是甲方的选择。'],
    ['introduce_score_order', '每格先看甲方的得分，然后读乙方的得分。', '先读乙方的得分，再读甲方的得分。'],
  ].flatMap(([action, valid, stale]) => [
    {cue: {action}, lines: [valid]},
    {cue: {action}, lines: [stale], invalid: true},
    {cue: {action}, lines: ['这是自由讲解，但没有当前身份。'], invalid: true},
  ]),
  {players: ['甲，方', '乙+方'], cue: {action: 'introduce_players'}, lines: ['假设甲，方和乙+方，开始游戏。']},
  {players: ['甲，方', '乙+方'], cue: {action: 'introduce_matrix_rows'}, lines: ['行，是甲，方的选择。']},
  {strategies: ['，R', '+B'], cue: {action: 'show_two_actions'}, lines: ['这一轮，每人可以选，R牌或+B牌。']},
  {strategies: ['，R', '+B'], cue: {action: 'map_actions_to_pure_strategies'}, lines: ['，R和+B就是两个纯策略。']},
  {strategies: ['，R', '+B'], cue: {action: 'show_multi_round_plan'}, lines: ['第一轮选，R；以后再决定。']},
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
  for (const [flags, optimization] of [[[], ''], [['-O'], ''], [['-OO'], ''], [[], '1'], [[], '2']]) {
    const result = spawnSync(pythonCommand(), [...flags, '-c', code], {cwd: ROOT, input: JSON.stringify(inputs), encoding: 'utf8', env: {...process.env, PYTHON: pythonCommand(), PYTHONOPTIMIZE: optimization}});
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
  const identities = {
    introduce_players: '假设甲方和乙方，玩一轮积分游戏。',
    show_two_actions: '每人可以选合作，或者退出。',
    map_actions_to_pure_strategies: '合作和退出就是两个纯策略。',
    show_multi_round_plan: '第一轮选合作；以后再选择。',
    introduce_matrix_rows: '行，是甲方的选择。',
    introduce_matrix_columns: '列，是乙方的选择。',
    introduce_score_order: '先读甲方的得分，再读乙方的得分。',
  };
  for (const segment of timeline.segments) {
    const current = identities[segment.visual_cue.action];
    if (current) {segment.voiceover = segment.text = current; segment.lines = [current]; segment.breath_points = [];}
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


test('real default and renamed timelines reject each paired stale identity independently', () => {
  const scenes = readJSON(path.join(ROOT, 'design/scenes.json'));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-identity-'));
  try {
    for (const changed of [false, true]) {
      const scene = structuredClone(scenes);
      if (changed) {
        scene.actors.forEach((actor, i) => {actor.label = ['明月', '青禾'][i];});
        scene.strategies.forEach((strategy, i) => {strategy.label = ['合作', '退出'][i];});
      }
      for (const relative of ['scripts/case_data.py', 'scripts/narration_validation.py', 'scripts/narration_io.py', 'scripts/text_contract.py', 'scripts/unicode-text-15.0.0.json', 'chapters/01-four-elements/narration/build_narration.py']) {
        const destination = path.join(directory, relative);
        fs.mkdirSync(path.dirname(destination), {recursive: true});
        fs.copyFileSync(path.join(ROOT, relative), destination);
      }
      fs.mkdirSync(path.join(directory, 'design'), {recursive: true});
      fs.writeFileSync(path.join(directory, 'design/scenes.json'), JSON.stringify(scene));
      const built = spawnSync(pythonCommand(), [path.join(directory, 'chapters/01-four-elements/narration/build_narration.py')], {encoding: 'utf8', env: {...process.env, PYTHON: pythonCommand()}});
      assert.equal(built.status, 0, built.stderr);
      const timeline = readJSON(path.join(directory, 'chapters/01-four-elements/narration/timeline.json'));
      assert.doesNotThrow(() => validateTimeline(timeline, scene));
      // Use labels that necessarily contradict this fixture, even after case-reuse.
      const stale = {
        introduce_players: changed ? '假设小A和小B，玩一轮积分游戏。' : '假设旧甲和旧乙，玩一轮积分游戏。',
        show_two_actions: '每人可以选旧红或旧蓝。',
        map_actions_to_pure_strategies: '旧红和旧蓝就是两个纯策略。',
        show_multi_round_plan: '第一轮选旧红；以后再决定。',
        introduce_matrix_rows: `行，是${scene.actors[1].label}的选择。`,
        introduce_matrix_columns: `列，是${scene.actors[0].label}的选择。`,
        introduce_score_order: `先读${scene.actors[1].label}的得分，再读${scene.actors[0].label}的得分。`,
      };
      for (const [action, speech] of Object.entries(stale)) {
        const invalid = structuredClone(timeline);
        const segment = invalid.segments.find(item => item.visual_cue.action === action);
        segment.voiceover = segment.text = speech; segment.lines = [speech]; segment.breath_points = [];
        assert.throws(() => validateTimeline(invalid, scene), /narration missing current-case/, `${changed}: ${action}`);
      }
    }
  } finally {fs.rmSync(directory, {recursive: true, force: true});}
});
