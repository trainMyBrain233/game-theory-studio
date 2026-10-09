import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {ROOT, pythonCommand} from '../scripts/python.mjs';
import {createChapter} from '../scripts/new-chapter.mjs';
import {readJSON, validateSchema, validateTimeline} from '../scripts/validate-data.mjs';

const chapter = readJSON(path.join(ROOT, 'chapters/00-original-example/chapter.json'));
const controls = [...Array.from({length: 32}, (_, i) => i), ...Array.from({length: 33}, (_, i) => 127 + i)];
const invalid = [
  '', ' ', '\u3000\u00a0', ' 甲', '乙\u3000',
  ...controls.map(point => `甲${String.fromCodePoint(point)}乙`),
  ...[0x2028, 0x2029, 0x200b, 0x200e, 0x202e, 0x2066, 0xfeff, 0x034f, 0x3164]
    .map(point => `甲${String.fromCodePoint(point)}乙`),
  '\u3164', '\u2800', '\u0301', '\uD800', '\uE000', '\u{1C89}', '—？！',
];
const visible = ['共同选择测试', '博弈论：收益、选择与均衡（第 2 章）', 'Café / e\u0301 — Ａ & B: 2026', '甲\u00a0乙', '章节'.repeat(20)];
const titleError = /chapter:|Chapter title: label must/;
function copy(root, relative) {
  const destination = path.join(root, relative);
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  fs.copyFileSync(path.join(ROOT, relative), destination);
}
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-chapter-title-'));
  for (const relative of ['scripts/new-chapter.mjs', 'scripts/validate-data.mjs', 'scripts/qa-data.mjs',
    'scripts/chapters.mjs', 'scripts/python.mjs', 'scripts/text-contract.mjs', 'scripts/unicode-text-15.0.0.json',
    'schemas/chapter.schema.json', 'schemas/scenes.schema.json', 'schemas/tokens.schema.json',
    'design/scenes.json', 'design/tokens.json']) copy(root, relative);
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  return root;
}
function run(root, script, args = []) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root, encoding: 'utf8', env: {...process.env, PYTHON: pythonCommand()},
  });
}

test('chapter metadata and scaffold share the Unicode visible single-line title contract before any writes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-title-no-writes-'));
  try {
    for (const title of invalid) {
      assert.throws(() => validateSchema('chapter', {...chapter, title}), titleError, JSON.stringify(title));
      // No chapters parent exists: reaching mkdir would fail with ENOENT instead.
      assert.throws(() => createChapter('02-example', title, root), titleError, JSON.stringify(title));
      assert.deepEqual(fs.readdirSync(root), []);
    }
    for (const title of visible) {
      const config = {...chapter, title};
      assert.doesNotThrow(() => validateSchema('chapter', config));
      assert.equal(config.title, title, 'Do not normalize or rewrite authored titles');
    }
  } finally {fs.rmSync(root, {recursive: true, force: true});}
});

test('chapter:new rejects whitespace, controls and newlines without publishing a directory or success output', () => {
  const root = fixture();
  try {
    fs.mkdirSync(path.join(root, 'chapters'));
    for (const title of [' ', '\u3000', '\u200b', '甲\n乙', '甲\r乙', '甲\u2028乙', '甲\u202e乙', '\u3164']) {
      const result = run(root, 'scripts/new-chapter.mjs', ['02-example', title]);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Chapter title: label must/);
      assert.equal(result.stdout, '');
      assert.deepEqual(fs.readdirSync(path.join(root, 'chapters')), []);
    }
  } finally {fs.rmSync(root, {recursive: true, force: true});}
});

test('qa:data rejects invalid existing chapter titles before opening or rebuilding narration', () => {
  const root = fixture();
  try {
    const directory = path.join(root, 'chapters', chapter.id);
    fs.mkdirSync(directory, {recursive: true});
    const metadata = path.join(directory, 'chapter.json');
    for (const title of [' ', '\u3000\u00a0', '\u200b', '甲\n乙', '甲\u2029乙', '甲\u2066乙', '\u3164', '\u2800', '\u0301']) {
      const before = JSON.stringify({...chapter, title});
      fs.writeFileSync(metadata, before);
      const result = run(root, 'scripts/qa-data.mjs');
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Chapter title: label must/);
      assert.equal(result.stdout, '');
      assert.equal(fs.readFileSync(metadata, 'utf8'), before);
      assert.deepEqual(fs.readdirSync(directory), ['chapter.json']);
    }
  } finally {fs.rmSync(root, {recursive: true, force: true});}
});

test('valid Unicode and professional punctuation survive the unchanged two-block scaffold verbatim', () => {
  const root = fixture();
  try {
    fs.mkdirSync(path.join(root, 'chapters'));
    for (const script of ['narration_validation.py', 'narration_io.py', 'case_data.py', 'text_contract.py']) copy(root, `scripts/${script}`);
    const scenes = readJSON(path.join(root, 'design/scenes.json'));
    for (const [i, title] of visible.entries()) {
      const directory = createChapter(`0${i + 2}-example`, title, root);
      assert.equal(readJSON(path.join(directory, 'chapter.json')).title, title);
      const timeline = readJSON(path.join(directory, 'narration/timeline.json'));
      assert.equal(timeline.title, title);
      assert.equal(timeline.sections[0].title, title);
      validateTimeline(timeline, scenes);
      assert.equal(timeline.segments.length, 2);
      assert.equal(timeline.duration, 9);
      assert(fs.readFileSync(path.join(directory, 'README.md'), 'utf8').startsWith(`# ${title}\n\n`));
      assert(fs.readFileSync(path.join(directory, 'narration/voiceover_v2_zh.txt'), 'utf8').startsWith(`${title}｜`));
    }
  } finally {fs.rmSync(root, {recursive: true, force: true});}
});
