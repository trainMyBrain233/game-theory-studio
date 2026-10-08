import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ROOT, runPython} from './python.mjs';
import {chapterDirectories, chapterConfig} from './chapters.mjs';
import {readJSON, validateSchema, validateScenes, validateTimeline} from './validate-data.mjs';

const read = relative => readJSON(path.join(ROOT, relative));
const scenes = read('design/scenes.json');
validateScenes(scenes);
validateSchema('tokens', read('design/tokens.json'));
let segments = 0;
const ids = new Set();
for (const directory of chapterDirectories()) {
  const config = chapterConfig(directory);
  validateSchema('chapter', config);
  assert.equal(config.id, path.basename(directory));
  assert(!ids.has(config.id)); ids.add(config.id);
  const narration = path.join(directory, 'narration');
  const timeline = readJSON(path.join(narration, 'timeline.json'));
  validateTimeline(timeline, scenes);
  assert.equal(config.title, timeline.title);
  assert.equal(config.caseId, scenes.caseId);
  assert.equal(config.stage, 'prototype', 'Current schema 2.1 is not audio-aligned');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-narration-'));
  try {
    const build = runPython([path.join(narration, 'build_narration.py'), '--output-dir', temporary], {encoding: 'utf8', stdio: 'pipe'});
    assert.equal(build.status, 0, build.stderr);
    for (const file of ['timeline.json', 'game_theory_v2_zh.srt', 'voiceover_v2_zh.txt']) {
      assert.deepEqual(fs.readFileSync(path.join(temporary, file)), fs.readFileSync(path.join(narration, file)), `${config.id}/${file} is stale; run npm run build:narration and review the diff`);
    }
  } finally { fs.rmSync(temporary, {recursive: true, force: true}); }
  segments += timeline.segments.length;
  console.log(`Chapter ${config.id}: ${timeline.segments.length} semantic blocks, ${timeline.duration}s; temporary rebuild matches tracked text.`);
}
assert(ids.size, 'No chapters discovered');
const cast = read('assets/characters/cast.json');
assert.equal(cast.activeCast, null);
assert.equal(cast.roles.A.matrixAxis, 'row'); assert.equal(cast.roles.B.matrixAxis, 'column');
assert.equal(cast.roles.A.payoffIndex, 0); assert.equal(cast.roles.B.payoffIndex, 1);
assert(Object.values(cast.roles).every(role => role.asset === null));
const archived = read('assets/characters/archive/proposals/cast.json');
assert.equal(archived.status, 'archived_not_selected');
assert.equal(archived.selectedProposal, null); assert.equal(archived.activeCast, null);
console.log(`Data QA: scenes, tokens and ${ids.size} chapter metadata/timelines; ${segments} blocks; scores, pauses and reproducible text; no third-party artwork activated.`);
