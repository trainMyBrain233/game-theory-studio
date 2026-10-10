import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {ROOT} from '../scripts/python.mjs';
import {verifyCastSource} from '../scripts/qa-cast-source.mjs';
const relative='assets/characters/archive/proposals';
test('tracked archived SVG and metadata are compared without overwriting edits',()=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'studio-cast-edit-'));
 try{
  fs.cpSync(path.join(ROOT,relative),path.join(temporary,relative),{recursive:true,filter:file=>!file.endsWith('.png')&&!file.includes('/qa/')});
  fs.mkdirSync(path.join(temporary,'scripts'));
  for(const script of ['python.mjs','qa-cast-source.mjs'])fs.copyFileSync(path.join(ROOT,'scripts',script),path.join(temporary,'scripts',script));
  assert(!fs.existsSync(path.join(temporary,'typography')) && !fs.existsSync(path.join(temporary,'node_modules')),
   'Source-only regeneration must not need font or native dependencies');
  assert.equal(verifyCastSource(temporary),11);
  for(const file of ['svg/human_A.svg','proposals.json','cast.json']){
   const target=path.join(temporary,relative,file),original=fs.readFileSync(target);
   const edited=Buffer.concat([original,Buffer.from(file.endsWith('.svg')?'\n<!-- authored edit -->':'\n ')]);
   fs.writeFileSync(target,edited);
   assert.throws(()=>verifyCastSource(temporary),/Archived source is stale/);
   const command=spawnSync(process.execPath,[path.join(temporary,'scripts/qa-cast-source.mjs')],{encoding:'utf8'});
   assert.notEqual(command.status,0);assert.match(command.stderr,/Archived source is stale/);
   assert.deepEqual(fs.readFileSync(target),edited,'QA overwrote the authored edit');
   fs.writeFileSync(target,original);
  }
 }finally{fs.rmSync(temporary,{recursive:true,force:true});}
});
