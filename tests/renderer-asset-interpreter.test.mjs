import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {withSourceFixture} from '../scripts/source-fixture.mjs';

test('readiness fixture propagates project venv and explicit PYTHON, and detects lost propagation',()=>withSourceFixture(root=>{
 const local=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
 fs.mkdirSync(path.dirname(local),{recursive:true});fs.writeFileSync(local,'selection fixture only');
 const logfile=path.join(root,'readiness-interpreter.log');
 const file=path.join(root,'tests/renderer-asset-readiness.test.mjs'),original=fs.readFileSync(file,'utf8');
 assert(original.includes('PYTHON:pythonCommand()'),'Interpreter propagation mutation anchor is required');
 for(const explicit of [false,true]){
  // Default module roots are canonicalized (for example macOS /var -> /private/var).
  const expected=explicit?path.join(root,'explicit-python'):fs.realpathSync(local);
  const env={...process.env,READINESS_EXPECTED_PYTHON:expected,READINESS_SPAWN_LOG:logfile};
  if(explicit)env.PYTHON=expected;else delete env.PYTHON;
  for(const mutation of [false,true]){
   fs.rmSync(logfile,{force:true});
   fs.writeFileSync(file,mutation?original.replace('PYTHON:pythonCommand()','PYTHON:undefined'):original);
   const result=spawnSync(process.execPath,['--loader','./tests/fixtures/asset-readiness-interpreter-loader.mjs','tests/renderer-asset-readiness.test.mjs'],{cwd:root,encoding:'utf8',env,timeout:30000});
   if(mutation){assert.notEqual(result.status,0);assert.match(result.stdout+result.stderr,/Readiness child must inherit the selected project interpreter/);assert(!fs.existsSync(logfile));}
   else{assert.equal(result.status,0,result.stdout+result.stderr);assert.equal(fs.readFileSync(logfile,'utf8'),expected);}
  }
 }
}));
