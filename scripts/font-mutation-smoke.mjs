import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {withSourceFixture} from './source-fixture.mjs';
import {pythonCommand} from './python.mjs';

withSourceFixture(root=>{
 const file=path.join(root,'typography/fonts.mjs'),source=fs.readFileSync(file,'utf8');
 const original='return `${weight} ${px}px "${serif?SERIF_FAMILY:FONT_FAMILY}"`;';
 assert(source.includes(original),'Font mutation fixture no longer matches the builder; update its three negative mutations.');
 for(const [name,replacement,reason] of [
  ['forced regular','return `400 ${px}px "${serif?SERIF_FAMILY:FONT_FAMILY}"`;',/Applied canvas font weight must be 700/],
  ['clamped size','return `${weight} 8px "${serif?SERIF_FAMILY:FONT_FAMILY}"`;',/Applied canvas font size must be 34px/],
  ['forced Sans','return `${weight} ${px}px "${FONT_FAMILY}"`;',/Applied canvas font family must be GameTheory Noto Serif SC/],
 ]){
  fs.writeFileSync(file,source.replace(original,replacement));
  // Disposable source fixtures have no .venv; retain the parent's interpreter.
  const run=spawnSync(process.execPath,['--import',path.join(root,'scripts/isolated-fonts.mjs'),path.join(root,'typography/qa-fonts.mjs')],{cwd:root,encoding:'utf8',env:{...process.env,PYTHON:pythonCommand()}});
  assert.notEqual(run.status,0,`${name} incorrectly passed font QA`);assert.match(run.stderr,reason);
  console.log(`Font negative mutation rejected: ${name}.`);
  if(name==='forced regular'&&process.argv.includes('--full-pipeline')){
   const pipeline=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['test'],{cwd:root,encoding:'utf8',env:{...process.env,PYTHON:pythonCommand()},maxBuffer:8*1024*1024});
   assert.notEqual(pipeline.status,0,'Forced regular unexpectedly passed npm test');
   assert.match(pipeline.stderr+pipeline.stdout,reason);
   console.log('Isolated full npm test rejects forced regular at the applied-weight assertion.');
  }
 }
});
