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
 const linked=path.join(root,'via-symlink');fs.symlinkSync(root,linked,'dir');
 fs.writeFileSync(path.join(root,'configured-python'),'not executed: explicit interpreter fixture');
 // Node canonicalizes imported module paths, just as macOS /var resolves to
 // /private/var. Exercise that distinction even on a Linux temporary directory.
 for(const entryRoot of [root,linked])for(const explicit of [false,true]) {
  fs.writeFileSync(file,original);fs.writeFileSync(logfile,'');
  const selectedLocal=path.join(entryRoot,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  // Default selection comes from an imported module's canonical root. Explicit
  // PYTHON is a caller-provided value and must retain its exact spelling.
  const expected=explicit?path.join(entryRoot,'configured-python'):fs.realpathSync(selectedLocal);
  const env={...process.env,FONT_MUTATION_EXPECTED_PYTHON:expected,FONT_MUTATION_SPAWN_LOG:logfile};
  if(explicit)env.PYTHON=expected;else delete env.PYTHON;
  const result=spawnSync(process.execPath,['--loader','./tests/fixtures/font-mutation-stubs-loader.mjs','scripts/font-mutation-smoke.mjs','--full-pipeline'],
   {cwd:entryRoot,encoding:'utf8',env});
  assert.equal(result.status,0,result.stdout+result.stderr);
  const calls=fs.readFileSync(logfile,'utf8').trim().split('\n').map(line=>JSON.parse(line));
  assert.equal(calls.length,4);assert(calls.every(call=>call.python===expected));
  assert.equal(calls.filter(call=>call.command===process.execPath).length,3);
 }
 const runner=path.join(root,'scripts/font-mutation-smoke.mjs'),runnerSource=fs.readFileSync(runner,'utf8');
 assert(runnerSource.includes('PYTHON:pythonCommand()'),'Interpreter propagation mutation anchor is required');
 const wrong=path.join(root,'other-venv','bin',path.basename(local));
 fs.mkdirSync(path.dirname(wrong),{recursive:true});fs.writeFileSync(wrong,'not executed: wrong interpreter fixture');
 for(const [replacement,explicit] of [
  ['undefined',false],
  [JSON.stringify(wrong),false],
  ['fs.realpathSync(pythonCommand())',true],
 ]) {
  fs.writeFileSync(file,original);fs.writeFileSync(logfile,'');
  fs.writeFileSync(runner,runnerSource.replaceAll('PYTHON:pythonCommand()',`PYTHON:${replacement}`));
  const expected=explicit?path.join(linked,'configured-python'):fs.realpathSync(local);
  const env={...process.env,FONT_MUTATION_EXPECTED_PYTHON:expected,FONT_MUTATION_SPAWN_LOG:logfile};
  if(explicit)env.PYTHON=expected;else delete env.PYTHON;
  const rejected=spawnSync(process.execPath,['--loader','./tests/fixtures/font-mutation-stubs-loader.mjs','scripts/font-mutation-smoke.mjs','--full-pipeline'],
   {cwd:linked,encoding:'utf8',env});
  assert.notEqual(rejected.status,0,`Incorrect interpreter mutation passed: ${replacement}`);
  assert.match(rejected.stderr,/Every mutation child must inherit the selected project interpreter/);
  assert.equal(fs.readFileSync(logfile,'utf8'),'','Incorrect interpreter must fail before any mocked child is accepted');
 }
}));
