import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {ROOT} from './python.mjs';

const relative='assets/characters/archive/proposals';
export function verifyCastSource(root=ROOT){
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'studio-cast-qa-'));
 try{
  const built=path.join(temporary,relative),authored=path.join(root,relative);
  fs.mkdirSync(built,{recursive:true});fs.mkdirSync(path.join(temporary,'typography'));
  for(const script of ['draw_cast.mjs','build_manifest.mjs'])fs.copyFileSync(path.join(authored,script),path.join(built,script));
  fs.copyFileSync(path.join(root,'typography/fonts.mjs'),path.join(temporary,'typography/fonts.mjs'));
  fs.symlinkSync(path.join(ROOT,'node_modules'),path.join(temporary,'node_modules'),'dir');
  for(const [script,args] of [['draw_cast.mjs',['--source-only']],['build_manifest.mjs',[]]]){
   const result=spawnSync(process.execPath,['--import',path.join(ROOT,'scripts/isolated-fonts.mjs'),path.join(built,script),...args],{encoding:'utf8'});
   assert.equal(result.status,0,result.stderr+result.stdout);
  }
  const generated=fs.readdirSync(path.join(built,'svg')).sort();
  assert.deepEqual(fs.readdirSync(path.join(authored,'svg')).filter(file=>path.extname(file).toLowerCase()==='.svg').sort(),generated,'Archived SVG file set differs from its generator');
  const files=[...generated.map(file=>'svg/'+file),'proposals.json','cast.json'];
  for(const file of files){
   assert(fs.existsSync(path.join(authored,file)),`Archived source missing: ${file}`);
   assert.deepEqual(fs.readFileSync(path.join(authored,file)),fs.readFileSync(path.join(built,file)),`Archived source is stale: ${file}; use npm run build:cast after reviewing generator changes`);
  }
  return files.length;
 }finally{fs.rmSync(temporary,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(fs.realpathSync(process.argv[1])).href)console.log(`Archived cast source QA: ${verifyCastSource()} SVG/JSON files match a temporary rebuild; inspected files unchanged.`);
