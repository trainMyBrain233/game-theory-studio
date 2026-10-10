import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {ROOT} from './python.mjs';

// Only public Git source candidates are copied; local fonts/dependencies are shared read-only.
export function withSourceFixture(callback){
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'studio-source-fixture-'));
 try{
  const list=spawnSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:ROOT});
  assert.equal(list.status,0);
  for(const relative of new Set(list.stdout.toString('utf8').split('\0').filter(Boolean))){
   const source=path.join(ROOT,relative);if(!fs.existsSync(source))continue;
   assert(!fs.lstatSync(source).isSymbolicLink(),`Source fixture refuses symlink: ${relative}`);
   fs.mkdirSync(path.dirname(path.join(temporary,relative)),{recursive:true});fs.copyFileSync(source,path.join(temporary,relative));
  }
  for(const directory of ['node_modules','typography/fonts'])fs.symlinkSync(path.join(ROOT,directory),path.join(temporary,directory),'dir');
  return callback(temporary);
 }finally{fs.rmSync(temporary,{recursive:true,force:true});}
}
