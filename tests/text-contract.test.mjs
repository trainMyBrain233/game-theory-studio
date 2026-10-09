import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {ROOT, pythonCommand} from '../scripts/python.mjs';
import {readJSON, validateScenes, validateTimeline} from '../scripts/validate-data.mjs';
import {TEXT_UNICODE_VERSION, readableCount, normalizedLabel, spokenNumber, validateSubtitleLine, validateSubtitleLines} from '../scripts/text-contract.mjs';

const scenes = readJSON(path.join(ROOT, 'design/scenes.json'));
const original = readJSON(path.join(ROOT, 'chapters/01-four-elements/narration/timeline.json'));
const python = (code, input) => {
  const result = spawnSync(pythonCommand(), ['-c', code], {cwd: ROOT, input: JSON.stringify(input), encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};

for (const [name, value] of [
  ['Latin accent', 'é'], ['Extension A Han', '㐀'], ['Extension B Han', '𠀀'],
  ['Extension H Han (Unicode 15)', '\u{31350}'], ['Arabic-Indic digit', '١'],
  ['number letter', 'Ⅻ'], ['other number', '²'],
]) test(`${name} counts at the 22/23-character boundary in canonical validation and Python generation`, () => {
  const atLimit = value.repeat(22), overLimit = value.repeat(23);
  assert.equal(readableCount(atLimit), 22);
  assert.equal(readableCount(overLimit), 23);
  validateSubtitleLine(atLimit);
  assert.throws(() => validateSubtitleLine(overLimit), /22 readable/);
  const results = python(`import json,sys
from pathlib import Path
sys.path.insert(0, 'scripts')
from case_data import Case
from text_contract import readable_count
case = Case(Path('.'))
results=[]
for text in json.load(sys.stdin):
    try: results.append({'count':readable_count(text),'lines':case.lines(text)})
    except ValueError as error: results.append({'count':readable_count(text),'error':str(error)})
print(json.dumps(results, ensure_ascii=False))`, [atLimit, overLimit, atLimit + '，' + value]);
  assert.deepEqual(results[0], {count: 22, lines: [atLimit]});
  assert.equal(results[1].count, 23);
  assert.match(results[1].error, /two semantic lines/);
  assert.deepEqual(results[2], {count: 23, lines: [atLimit + '，', value]});
  for (const [text, rejected] of [[atLimit, false], [overLimit, true]]) {
    const timeline = structuredClone(original), segment = timeline.segments[0];
    segment.voiceover = segment.text = text; segment.lines = [text]; segment.breath_points = [];
    if (rejected) assert.throws(() => validateTimeline(timeline, scenes), /22 readable/);
    else validateTimeline(timeline, scenes);
  }
});

test('pinned Unicode support is independent of a newer Node UCD and fails closed', () => {
  assert.equal(TEXT_UNICODE_VERSION, '15.0.0');
  for (const value of ['\u{1C89}', '\u{2EBF0}', '\u{10FFFF}', '\uE000', '\uD800']) {
    assert.throws(() => readableCount(value), /supported, assigned Unicode 15/);
    assert.throws(() => normalizedLabel(value), /label must/);
  }
  // Unicode 16 Cyrillic TJE is a letter in Node's newer UCD, outside this contract.
  if (Number(process.versions.unicode.split('.')[0]) >= 16) assert.match('\u{1C89}', /\p{L}/u);
  assert.equal(readableCount('e\u0301，。 𝟜🙂'), 2);
  const actual = python(`import json,sys
sys.path.insert(0, 'scripts')
from text_contract import readable_count
out=[]
for text in json.load(sys.stdin):
    try: out.append(readable_count(text))
    except ValueError: out.append('unsupported')
print(json.dumps(out))`, ['\u{1C89}', '\u{2EBF0}', '\u{10FFFF}', '\uE000', '\uD800', 'e\u0301，。 𝟜🙂']);
  assert.deepEqual(actual, ['unsupported', 'unsupported', 'unsupported', 'unsupported', 'unsupported', 2]);
});

test('Unicode-derived ranges retain a complete version-matched distribution notice', () => {
  const table = readJSON(path.join(ROOT, 'scripts/unicode-text-15.0.0.json'));
  assert.equal(table.license, 'Unicode-DFS-2016');
  assert.equal(table.licenseSource, 'https://raw.githubusercontent.com/unicode-org/icu/release-72-1/icu4c/LICENSE');
  const notice = fs.readFileSync(path.join(ROOT, table.licenseFile), 'utf8');
  for (const text of ['Copyright © 1991-2022 Unicode, Inc. All rights reserved.',
    'Permission is hereby granted, free of charge', 'THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS"',
    'IN NO EVENT SHALL THE COPYRIGHT HOLDER', 'written authorization of the copyright holder.']) assert(notice.includes(text));
  assert(!notice.includes('Copyright © 1991-2026'));
  assert(fs.readFileSync(path.join(ROOT, 'docs/third-party-content.md'), 'utf8').includes('licenses/Unicode-15.0.0.txt'));
});

test('fixed category table regenerates byte-for-byte with its documented UCD', () => {
  const version = python('import json,unicodedata; print(json.dumps(unicodedata.unidata_version))');
  if (version !== '15.0.0') return; // Normal consumers support later runtimes; generator deliberately requires its pinned UCD.
  const result = spawnSync(pythonCommand(), ['scripts/build_unicode_text_data.py', '--check'], {cwd: ROOT, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /byte-for-byte/);
});

for (const [name, labels] of [
  ['trimmed', [' A', 'B']], ['whitespace-only', ['　', 'B']], ['control', ['A\t', 'B']],
  ['embedded newline', ['A\nB', 'C']], ['Unicode line separator', ['A\u2028', 'B']],
  ['invisible format', ['A\u200B', 'B']], ['default-ignorable mark', ['A\u034F', 'B']],
  ['default-ignorable letter', ['\u3164', 'B']], ['non-visible punctuation', ['。', 'B']],
  ['unpaired surrogate', ['\uD800', 'B']], ['NFKC fullwidth collision', ['Ａ', 'A']],
  ['NFKC combining collision', ['é', 'e\u0301']], ['NFKC space collision', ['A B', 'A\u00A0B']],
  ['Unicode 15 compatibility collision', ['\u{1E030}', 'а']],
]) test(`canonical labels reject ${name} in both consumers`, () => {
  const changed = structuredClone(scenes);
  changed.actors.forEach((actor, index) => {actor.label = labels[index];});
  assert.throws(() => validateScenes(changed), /label must|visible labels must differ/);
  const result = python(`import json,sys,tempfile
from pathlib import Path
sys.path.insert(0, 'scripts')
from case_data import Case
with tempfile.TemporaryDirectory() as temporary:
    root=Path(temporary); (root/'design').mkdir()
    (root/'design/scenes.json').write_text(json.dumps(json.load(sys.stdin)), encoding='utf-8')
    try: Case(root); print(json.dumps('accepted'))
    except ValueError as error: print(json.dumps(str(error)))`, changed);
  assert.match(result, /label must|visible labels must differ/);
});

test('valid distinct labels preserve identity and standard NFKC agrees across languages', () => {
  const labels = ['欧阳小明', '𠀀é', 'A B', 'Ａ', 'é', 'e\u0301', '\u{1E030}', '가', '가'];
  const actual = python(`import json,sys
sys.path.insert(0,'scripts')
from text_contract import normalized_label
print(json.dumps([normalized_label(label) for label in json.load(sys.stdin)],ensure_ascii=False))`, labels);
  assert.deepEqual(labels.map(label => normalizedLabel(label)), actual);
  const changed = structuredClone(scenes);
  changed.actors[0].label = '欧阳小明'; changed.actors[1].label = '𠀀é';
  changed.strategies[0].label = '合作'; changed.strategies[1].label = '退出';
  validateScenes(changed);
  changed.strategies[0].label = 'Ａ'; changed.strategies[1].label = 'A';
  assert.throws(() => validateScenes(changed), /Strategy visible labels must differ/);
});

function replaceLines(timeline, id, lines) {
  const segment = timeline.segments.find(item => item.id === id);
  assert(segment, id); assert.equal(lines.join(''), segment.voiceover);
  segment.lines = lines; segment.text = lines.join('\n');
}
function splitAfter(timeline, id, prefix) {
  const segment = timeline.segments.find(item => item.id === id);
  assert(segment, id);
  assert(prefix.length > 0 && prefix.length < segment.voiceover.length && segment.voiceover.startsWith(prefix), `${id}: split must be inside the current voiceover`);
  const lines = [prefix, segment.voiceover.slice(prefix.length)];
  lines.forEach(line => validateSubtitleLine(line)); // Reach semantic validation, not length/visibility rejection.
  replaceLines(timeline, id, lines);
}
const semanticSplits = [
  ['choice clause', 's24_rr_select', (_segment, data) => `${data.actors[0].label}选`],
  ['player name', 's24_rr_select', (_segment, data) => Array.from(data.actors[0].label)[0]],
  ['owner/result', 's27_rb_score', (_segment, data) => data.actors[0].label],
  ['spoken score', 's27_rb_score', (segment, data) => `${data.actors[0].label}得${spokenNumber(segment.visual_cue.scores[0]).slice(0, -1)}`],
];
function semanticFixture(source, data, kind) {
  const changed = structuredClone(data);
  let regenerate = false;
  if (kind === 'player name' && Array.from(data.actors[0].label).length < 2) {
    changed.actors[0].label = '甲方'; changed.actors[1].label = '乙方';
    regenerate = true;
  }
  const scores = data.payoffs[0][1];
  if (['owner/result', 'spoken score', 'complete clauses'].includes(kind) &&
      (scores[0] === scores[1] || (kind === 'spoken score' && spokenNumber(scores[0]).length < 2))) {
    // Equal scores produce a collective result; single-character numbers cannot
    // be split internally. Build a suitable fixture without altering voiceover.
    changed.payoffs[0][1] = [27, 36];
    regenerate = true;
  }
  return regenerate ? [generateTextTimeline(changed), changed] : [source, data];
}
function assertSemanticSplitRejected(source, data, [name, id, prefix]) {
  [source, data] = semanticFixture(source, data, name);
  validateTimeline(source, data);
  const timeline = structuredClone(source), segment = timeline.segments.find(item => item.id === id);
  splitAfter(timeline, id, prefix(segment, data));
  assert.throws(() => validateTimeline(timeline, data), {message: new RegExp(`^${id}: subtitle splits (a semantic clause|protected current-case token or clause)`)});
}
for (const mutation of semanticSplits) test(`canonical timeline rejects splitting ${mutation[0]} without changing its voiceover`, () => {
  assertSemanticSplitRejected(original, scenes, mutation);
});

function generateTextTimeline(data) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-semantic-splits-'));
  try {
    const builder = 'chapters/01-four-elements/narration/build_narration.py';
    for (const relative of [builder, ...['case_data.py', 'text_contract.py', 'unicode-text-15.0.0.json', 'narration_io.py'].map(name => `scripts/${name}`)]) {
      const target = path.join(temporary, relative);
      fs.mkdirSync(path.dirname(target), {recursive: true});
      fs.copyFileSync(path.join(ROOT, relative), target);
    }
    fs.mkdirSync(path.join(temporary, 'design'));
    fs.writeFileSync(path.join(temporary, 'design/scenes.json'), JSON.stringify(data));
    const output = path.join(temporary, 'generated');
    const build = spawnSync(pythonCommand(), [path.join(temporary, builder), '--output-dir', output], {cwd: temporary, encoding: 'utf8'});
    assert.equal(build.status, 0, build.stderr);
    const timeline = readJSON(path.join(output, 'timeline.json'));
    validateTimeline(timeline, data);
    return timeline;
  } finally {fs.rmSync(temporary, {recursive: true, force: true});}
}

test('canonical timeline rejects splitting equal-payoff collective result without changing its voiceover', () => {
  // Case-reuse deliberately makes every payoff asymmetric; generate an explicit
  // equal-score case rather than assuming the checked-in RR cell stays equal.
  const equalScenes = structuredClone(scenes);
  equalScenes.payoffs[0][0] = [27, 27];
  const timeline = generateTextTimeline(equalScenes);
  splitAfter(timeline, 's25_rr_score', '两个人，');
  assert.throws(() => validateTimeline(timeline, equalScenes), {message: /^s25_rr_score: subtitle splits protected current-case token or clause/});
});

function assertCompleteClauses(source, data) {
  [source, data] = semanticFixture(source, data, 'complete clauses');
  const timeline = structuredClone(source), actor = data.actors[0].label;
  const choice = timeline.segments.find(item => item.id === 's24_rr_select');
  const score = timeline.segments.find(item => item.id === 's27_rb_score');
  splitAfter(timeline, choice.id, `${actor}选${choice.visual_cue.choices.A}，`);
  splitAfter(timeline, score.id, `${actor}得${spokenNumber(score.visual_cue.scores[0])}分，`);
  validateTimeline(timeline, data);
}
test('complete choice, condition and result clauses may occupy separate lines', () => {
  assertCompleteClauses(original, scenes);
  const cue = {matrix_cell: 'RB', choices: {A: '合作', B: '退出'}, scores: [27, 36]};
  const voiceover = '如果乙方选退出，甲方得二十七分。';
  validateSubtitleLines(['如果乙方选退出，', '甲方得二十七分。'], voiceover, ['甲方', '乙方'], ['合作', '退出'], cue);
  assert.throws(() => validateSubtitleLines(['如果乙方选', '退出，甲方得二十七分。'], voiceover, ['甲方', '乙方'], ['合作', '退出'], cue), /splits/);
  assert.throws(() => validateSubtitleLines(['如果乙方选退出，甲方得二十', '七分。'], voiceover, ['甲方', '乙方'], ['合作', '退出'], cue), /splits/);
});

test('case-reuse text rebuild preserves semantic split negatives and complete-clause positives without Canvas', () => {
  const changed = structuredClone(scenes);
  changed.actors[0].label = '明月'; changed.actors[1].label = '青禾';
  changed.strategies[0].label = '合作'; changed.strategies[1].label = '退出';
  changed.payoffs = [[[11, 12], [21, 22]], [[31, 32], [41, 42]]];
  changed.selected = {row: 1, column: 0, actorA: 'blue', actorB: 'red'};
  const timeline = generateTextTimeline(changed);
  for (const mutation of semanticSplits) assertSemanticSplitRejected(timeline, changed, mutation);
  assertCompleteClauses(timeline, changed);
  // The same assertions must still reach their intended validation when the
  // current case supplies no divisible name/number and no owner-specific score.
  changed.actors[0].label = '甲'; changed.actors[1].label = '乙';
  changed.payoffs = [[[0, 0], [5, 5]], [[10, 10], [99, 99]]];
  const indivisible = generateTextTimeline(changed);
  for (const mutation of semanticSplits) assertSemanticSplitRejected(indivisible, changed, mutation);
  assertCompleteClauses(indivisible, changed);
});

test('punctuation inside current-case labels is never mistaken for a semantic break', () => {
  const players = ['甲，乙', '丙'], strategies = ['选甲', '选乙'], cue = {choices: {A: '选甲', B: '选乙'}, scores: [11, 23]};
  const voiceover = '甲，乙选选甲，丙选选乙。';
  validateSubtitleLines(['甲，乙选选甲，', '丙选选乙。'], voiceover, players, strategies, cue);
  assert.throws(() => validateSubtitleLines(['甲，', '乙选选甲，丙选选乙。'], voiceover, players, strategies, cue), /protected current-case/);
  const result = '甲，乙，得十一分，丙得二十三分。';
  assert.throws(() => validateSubtitleLines(['甲，乙，', '得十一分，丙得二十三分。'], result, players, strategies, cue), /protected current-case/);
});

test('subtitle validation rejects hidden characters, internal newlines and whitespace-only voiceover equivalence', () => {
  for (const text of ['小A\u200B选红。', '小A\n选红。', '小A\u2028选红。', ' 小A选红。']) {
    const timeline = structuredClone(original), segment = timeline.segments[0];
    segment.text = segment.voiceover = text; segment.lines = [text]; segment.breath_points = [];
    assert.throws(() => validateTimeline(timeline, scenes), /trimmed|single-line/);
  }
  const timeline = structuredClone(original), segment = timeline.segments[0];
  segment.voiceover = segment.voiceover.replace('两个人', '两 个 人');
  assert.throws(() => validateTimeline(timeline, scenes), /exact voiceover/);
});

test('long names, changed strategies and asymmetric scores build and validate together without changing tracked narration', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-text-contract-'));
  const originalFiles = ['timeline.json', 'game_theory_v2_zh.srt', 'voiceover_v2_zh.txt'].map(name => [path.join(ROOT, 'chapters/01-four-elements/narration', name)]);
  originalFiles.forEach(item => item.push(fs.readFileSync(item[0])));
  try {
    for (const directory of ['scripts', 'chapters']) fs.cpSync(path.join(ROOT, directory), path.join(temporary, directory), {recursive: true, filter: source => !source.includes('__pycache__')});
    const changed = structuredClone(scenes);
    changed.actors[0].label = '欧阳小明'; changed.actors[1].label = '司马小红';
    changed.strategies[0].label = '合作'; changed.strategies[1].label = '退出';
    changed.payoffs = [[[17, 28], [39, 46]], [[57, 68], [79, 98]]];
    changed.selected = {row: 1, column: 0, actorA: 'blue', actorB: 'red'};
    fs.mkdirSync(path.join(temporary, 'design'));
    fs.writeFileSync(path.join(temporary, 'design/scenes.json'), JSON.stringify(changed));
    for (const chapter of ['00-original-example', '01-four-elements']) {
      const output = path.join(temporary, 'generated', chapter);
      const build = spawnSync(pythonCommand(), [path.join(temporary, 'chapters', chapter, 'narration/build_narration.py'), '--output-dir', output], {cwd: temporary, encoding: 'utf8'});
      assert.equal(build.status, 0, build.stderr);
      const produced = readJSON(path.join(output, 'timeline.json'));
      validateTimeline(produced, changed);
      assert(produced.segments.some(segment => segment.voiceover === '欧阳小明得十七分，司马小红得二十八分。'));
      if (chapter === '01-four-elements') {
        assert(produced.segments.some(segment => segment.voiceover === '欧阳小明得五十七分，司马小红得六十八分。'));
        const negative = structuredClone(produced), segment = negative.segments.find(item => item.visual_cue.choices?.A === '退出');
        const offset = segment.voiceover.indexOf('退出') + 1;
        segment.lines = [segment.voiceover.slice(0, offset), segment.voiceover.slice(offset)]; segment.text = segment.lines.join('\n');
        assert.throws(() => validateTimeline(negative, changed), /splits/);
      }
    }
    // Actual chapter generation must use the same Unicode count for speech estimates
    // and metrics, not only in Case.lines or the JS validator.
    changed.actors[0].label = 'éééé'; changed.actors[1].label = '𠀀𠀀𠀀𠀀';
    changed.strategies[0].label = '١٢'; changed.strategies[1].label = 'Ⅻ²';
    fs.writeFileSync(path.join(temporary, 'design/scenes.json'), JSON.stringify(changed));
    const unicodeOutput = path.join(temporary, 'generated', 'unicode');
    const unicodeBuild = spawnSync(pythonCommand(), [path.join(temporary, 'chapters/01-four-elements/narration/build_narration.py'), '--output-dir', unicodeOutput], {cwd: temporary, encoding: 'utf8'});
    assert.equal(unicodeBuild.status, 0, unicodeBuild.stderr);
    const unicodeTimeline = readJSON(path.join(unicodeOutput, 'timeline.json'));
    validateTimeline(unicodeTimeline, changed);
    const setup = unicodeTimeline.segments.find(segment => segment.id === 's04_setup');
    assert.equal(setup.voiceover, '假设éééé和𠀀𠀀𠀀𠀀，玩一轮积分游戏。');
    assert.equal(readableCount(setup.voiceover), 18);
    assert.equal(setup.spoken_duration, 4.7); // 18 / 3.8 rounded; old regex stayed at 4.2.
    const metrics = readJSON(path.join(unicodeOutput, 'qa/metrics.json'));
    assert.equal(metrics.spoken_characters, unicodeTimeline.segments.reduce((sum, segment) => sum + readableCount(segment.voiceover), 0));
    for (const [filename, bytes] of originalFiles) assert.deepEqual(fs.readFileSync(filename), bytes);
  } finally {fs.rmSync(temporary, {recursive: true, force: true});}
});
