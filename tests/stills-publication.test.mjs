import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {withSourceFixture} from '../scripts/source-fixture.mjs';
import {pythonCommand} from '../scripts/python.mjs';
import {verifyStillsManifest,sha256,STILLS_MANIFEST,TIMELINE_PATH} from '../production/src/checkpoints.mjs';
const names=['frame_1.00_1920.png','frame_2.00_1920.png',STILLS_MANIFEST];
function snapshot(directory){
 if(!fs.existsSync(directory))return null;
 return Object.fromEntries(fs.readdirSync(directory,{recursive:true}).sort().map(name=>{
  const file=path.join(directory,name),info=fs.lstatSync(file);
  return [name,info.isSymbolicLink()?{link:fs.readlinkSync(file)}:info.isDirectory()?'directory':fs.readFileSync(file)];
 }));
}
function seed(root,mixed=false){
 const output=path.join(root,'output');fs.mkdirSync(output,{recursive:true});
 for(const [index,name] of names.entries())if(!mixed||index!==1)fs.writeFileSync(path.join(output,name),Buffer.from([index,0,255,128]));
 fs.writeFileSync(path.join(output,'user-file'),'unrelated sentinel');return output;
}
function run(root,{hook='',env={},cwd=root}={}){
 const preload=path.join(root,'stills-publication-injection.mjs');fs.writeFileSync(preload,`import fs from 'node:fs';\n${hook}`);
 const result=spawnSync(process.execPath,['--import',preload,'--import',path.join(root,'scripts/isolated-fonts.mjs'),'--loader',path.join(root,'tests/fixtures/stills-publication-loader.mjs'),path.join(root,'production/render.mjs'),'--stills','--placeholder-cast','--times','1,2'],{cwd,encoding:'utf8',env:{...process.env,PYTHON:pythonCommand(),...env},timeout:30000});
 assert.ifError(result.error);
 assert.deepEqual(fs.readdirSync(root).filter(name=>name.startsWith('.publication-')),[],'Remove all staging and recovery directories after successful publication or rollback');
 return result;
}
for(const name of [...names,'directory'])test(`stills reject ${name} symlink without changing any sentinel`,()=>withSourceFixture(root=>{
 const output=seed(root),sentinel=path.join(root,'sentinel');fs.writeFileSync(sentinel,'tracked/user sentinel');
 if(name==='directory'){
  fs.renameSync(output,path.join(root,'original-output'));fs.symlinkSync(path.join(root,'original-output'),output,'dir');
 }else{fs.unlinkSync(path.join(output,name));fs.symlinkSync(sentinel,path.join(output,name));}
 const before=snapshot(output),result=run(root);
 assert.notEqual(result.status,0,result.stdout);assert.match(result.stderr,/not a .*symbolic link/);
 assert.equal(fs.readFileSync(sentinel,'utf8'),'tracked/user sentinel');assert.deepEqual(snapshot(output),before);
 if(name==='directory')assert(fs.lstatSync(output).isSymbolicLink());
}));
for(const mixed of [false,true])test(`late still manifest rename failure restores ${mixed?'mixed':'existing'} entire batch`,()=>withSourceFixture(root=>{
 const output=seed(root,mixed),before=snapshot(output);
 const result=run(root,{hook:`const real=fs.renameSync;let failed=false;fs.renameSync=(source,target,...rest)=>{
  if(!failed&&String(source).includes('/new/output/${STILLS_MANIFEST}')){failed=true;throw Error('INJECTED_LATE_STILL_RENAME');}
  return real(source,target,...rest);
 };`});
 assert.notEqual(result.status,0);assert.match(result.stderr,/INJECTED_LATE_STILL_RENAME/);assert.equal(result.stdout,'');assert.deepEqual(snapshot(output),before);
}));
for(const existing of [false,true])for(const mode of ['draw','source'])test(`late ${mode} failure preserves ${existing?'existing':'absent'} still batch`,()=>withSourceFixture(root=>{
 const output=path.join(root,'output');if(existing)seed(root);const before=snapshot(output);
 const result=run(root,{env:mode==='draw'?{STILLS_FAIL_TIME:'2'}:{STILLS_MUTATE_TIME:'2'}});
 assert.notEqual(result.status,0);assert.match(result.stderr,mode==='draw'?/INJECTED_LATE_STILL_DRAW/:/Render inputs changed|Stale still render identity/);
 assert.equal(result.stdout,'');assert.deepEqual(snapshot(output),before);
}));
test('real PNG bytes and schema-v2 checkpoint manifest publish together while obsolete manifest temp symlink is untouched',()=>withSourceFixture(root=>{
 const output=seed(root),sentinel=path.join(root,'sentinel');fs.writeFileSync(sentinel,'keep fixed temp target');
 const temporary=path.join(output,STILLS_MANIFEST+'.tmp');fs.symlinkSync(sentinel,temporary);
 const result=run(root);assert.equal(result.status,0,result.stdout+result.stderr);
 assert.equal(fs.readFileSync(sentinel,'utf8'),'keep fixed temp target');assert(fs.lstatSync(temporary).isSymbolicLink());
 const manifest=JSON.parse(fs.readFileSync(path.join(output,STILLS_MANIFEST)));
 verifyStillsManifest(manifest,fs.readFileSync(path.join(root,TIMELINE_PATH)),{root});assert.deepEqual(manifest.explicit_times,[1,2]);
 for(const point of manifest.checkpoints){
  const png=fs.readFileSync(path.join(output,point.file));assert.equal(sha256(png),point.sha256);assert.equal(png.readUInt32BE(16),1920);assert.equal(png.readUInt32BE(20),1080);assert(png.includes(Buffer.from('StudioCheckpoint\0')));
 }
 const decoded=spawnSync(process.execPath,['--import',path.join(root,'scripts/isolated-fonts.mjs'),'--input-type=module','-e',`
  import assert from 'node:assert/strict';import {createCanvas,loadImage} from '@napi-rs/canvas';
  for(const [file,pixel] of ${JSON.stringify([[names[0],[18,52,86,255]],[names[1],[171,205,239,255]]])}){
   const image=await loadImage('output/'+file);assert.equal(image.width,1920);assert.equal(image.height,1080);
   const canvas=createCanvas(1,1),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);assert.deepEqual([...ctx.getImageData(0,0,1,1).data],pixel);
  }
 `],{cwd:root,encoding:'utf8',env:{...process.env,PYTHON:pythonCommand()},timeout:30000});
 assert.equal(decoded.status,0,decoded.stdout+decoded.stderr);
 assert.deepEqual(fs.readdirSync(output).sort(),[...names,STILLS_MANIFEST+'.tmp','user-file'].sort());
}));
