import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {withSourceFixture} from '../scripts/source-fixture.mjs';

test('font mutation children retain project-venv and explicit PYTHON selection in source fixtures',()=>withSourceFixture(root=>{
 const local=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
 fs.mkdirSync(path.dirname(local),{recursive:true});fs.writeFileSync(local,'not executed: interpreter selection fixture');
 const file=path.join(root,'typography/fonts.mjs'),original=fs.readFileSync(file);
 const logfile=path.join(root,'mutation-spawns.jsonl');
 for(const explicit of [false,true]) {
  fs.writeFileSync(file,original);fs.writeFileSync(logfile,'');
  const expected=explicit?path.join(root,'configured-python'):local;
  const env={...process.env,FONT_MUTATION_EXPECTED_PYTHON:expected,FONT_MUTATION_SPAWN_LOG:logfile};
  if(explicit)env.PYTHON=expected;else delete env.PYTHON;
  const result=spawnSync(process.execPath,['--loader','./tests/fixtures/font-mutation-stubs-loader.mjs','scripts/font-mutation-smoke.mjs','--full-pipeline'],
   {cwd:root,encoding:'utf8',env});
  assert.equal(result.status,0,result.stdout+result.stderr);
  const calls=fs.readFileSync(logfile,'utf8').trim().split('\n').map(line=>JSON.parse(line));
  assert.equal(calls.length,4);assert(calls.every(call=>call.python===expected));
  assert.equal(calls.filter(call=>call.command===process.execPath).length,3);
 }
}));
