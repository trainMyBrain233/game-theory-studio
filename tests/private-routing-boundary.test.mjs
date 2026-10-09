import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {withSourceFixture} from '../scripts/source-fixture.mjs';

test('routing children preserve Python and unrelated failures cannot satisfy the malformed-SVG negative',()=>withSourceFixture(root=>{
 const local=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
 fs.mkdirSync(path.dirname(local),{recursive:true});fs.writeFileSync(local,'not executed: interpreter fixture');
 const logfile=path.join(root,'routing-spawns.jsonl');
 const run=(mode,explicit=false)=>{
  fs.writeFileSync(logfile,'');
  const expected=explicit?path.join(root,'configured-python'):fs.realpathSync(local);
  const env={...process.env,ROUTING_MOCK_MODE:mode,ROUTING_EXPECTED_PYTHON:expected,ROUTING_SPAWN_LOG:logfile};
  if(explicit)env.PYTHON=expected;else delete env.PYTHON;
  return spawnSync(process.execPath,['--loader','./tests/fixtures/private-routing-stubs-loader.mjs','production/assets/verify-private-routing.mjs'],{cwd:root,encoding:'utf8',env});
 };
 for(const explicit of [false,true]) {
  const passed=run('pass',explicit);assert.equal(passed.status,0,passed.stdout+passed.stderr);
  assert.deepEqual(fs.readFileSync(logfile,'utf8').trim().split('\n').map(line=>JSON.parse(line).publicRoute),[false,true]);
 }
 for(const [mode,reason] of [
  ['private-font-error',/Private asset-routing subprocess failed: status=1.*Missing fontTools/s],
  ['private-signal',/Private asset-routing subprocess failed: status=null, signal=SIGKILL/],
  ['private-spawn-error',/spawn error=spawn fixture ENOENT/],
  ['public-font-error',/Public route failed before the expected malformed SVG rejection:.*Missing fontTools/s],
  ['public-signal',/Broken SVG must fail at the public person decode boundary: status=null, signal=SIGKILL/],
  ['public-success',/Broken SVG must fail at the public person decode boundary: status=0/],
 ]) {
  const rejected=run(mode);assert.notEqual(rejected.status,0,`${mode} incorrectly passed`);
  assert.match(rejected.stderr,reason);assert.doesNotMatch(rejected.stderr,/unexpectedly tried to decode/);
 }
 const runner=path.join(root,'production/assets/verify-private-routing.mjs'),source=fs.readFileSync(runner,'utf8');
 assert(source.includes('PYTHON:pythonCommand()'));
 fs.writeFileSync(runner,source.replace('PYTHON:pythonCommand()','PYTHON:undefined'));
 const missing=run('pass');assert.notEqual(missing.status,0);assert.match(missing.stderr,/Routing child must retain the selected project interpreter/);
}));
