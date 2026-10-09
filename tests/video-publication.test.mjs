import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {encodeVideo} from '../production/src/encode-video.mjs';
import {pythonCommand,ROOT} from '../scripts/python.mjs';

function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'video-publication-'));
 const bin=path.join(dir,'bin');fs.mkdirSync(bin);
 fs.copyFileSync(new URL('./fixtures/publication-encoder.mjs',import.meta.url),path.join(bin,'ffmpeg'));fs.chmodSync(path.join(bin,'ffmpeg'),0o755);
 return {dir,bin,file:path.join(dir,'film.mp4'),record:path.join(dir,'args.json')};
}
for(const old of [true,false])for(const mode of ['success','fail','draw','epipe','signal','early','interrupt','empty'])test(`renderer publication: ${mode}, existing=${old}`,()=>{
 const f=fixture();
 try{
  if(old)fs.writeFileSync(f.file,'old sentinel');
  const run=spawnSync(process.execPath,['--loader',path.join(ROOT,'tests/fixtures/video-publication-loader.mjs'),path.join(ROOT,'production/render.mjs'),'--duration','0.1','--out',f.file],{cwd:f.dir,env:{...process.env,PYTHON:pythonCommand(),PATH:`${f.bin}${path.delimiter}${process.env.PATH}`,ENCODER_MODE:mode,ENCODER_RECORD:f.record},encoding:'utf8',timeout:10000});
  assert.ifError(run.error);
  assert.equal(run.signal,null,run.stderr);
  if(mode==='success'){
   assert.equal(run.status,0,run.stderr);assert.equal(fs.readFileSync(f.file,'utf8'),'complete video');
  }else{
   assert.notEqual(run.status,0,run.stdout);
   assert.match(run.stderr,/Video encoding stopped/);
   if(mode==='draw')assert.match(run.stderr,/intentional draw failure/);
   if(mode==='fail')assert.match(run.stderr,/intentional disk\/encode failure/);
   if(mode==='interrupt')assert.match(run.stderr,/interrupted by SIGTERM/);
   if(old)assert.equal(fs.readFileSync(f.file,'utf8'),'old sentinel');else assert.equal(fs.existsSync(f.file),false);
  }
  assert.deepEqual(fs.readdirSync(f.dir).filter(name=>name.startsWith('.film')),[],'Temporary videos must be removed after child close.');
  const args=JSON.parse(fs.readFileSync(f.record));
  assert.notEqual(args.at(-1),f.file);assert.equal(path.dirname(args.at(-1)),f.dir);assert.equal(path.extname(args.at(-1)),'.mp4');
  assert.equal(args[args.indexOf('-framerate')+1],'30');
 }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});

test('spawn failure preserves old video and removes reserved temporary file',async()=>{
 const f=fixture();try{
  fs.writeFileSync(f.file,'old sentinel');
  await assert.rejects(encodeVideo({file:f.file,command:path.join(f.dir,'absent-encoder'),args:[],frameCount:1,frame:()=>Buffer.alloc(4)}),/ENOENT/);
  assert.equal(fs.readFileSync(f.file,'utf8'),'old sentinel');
  assert.deepEqual(fs.readdirSync(f.dir).sort(),['bin','film.mp4']);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});

test('actual ffmpeg publishes a two-frame video atomically',{skip:spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status!==0},async()=>{
 const f=fixture();try{
  fs.writeFileSync(f.file,'old sentinel');
  await encodeVideo({file:f.file,args:['-y','-f','rawvideo','-pixel_format','rgba','-video_size','16x16','-framerate','30','-i','-','-c:v','libx264','-pix_fmt','yuv420p','-threads','1','-filter_threads','1'],frameCount:2,frame:()=>Buffer.alloc(16*16*4,255)});
  const probe=spawnSync('ffprobe',['-v','error','-count_frames','-show_entries','stream=nb_read_frames,r_frame_rate','-of','json',f.file],{encoding:'utf8'});
  assert.equal(probe.status,0,probe.stderr);
  const stream=JSON.parse(probe.stdout).streams[0];assert.equal(stream.nb_read_frames,'2');assert.equal(stream.r_frame_rate,'30/1');
  assert.deepEqual(fs.readdirSync(f.dir).sort(),['bin','film.mp4']);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});


test('publication rename failure cleans temporary output without changing destination',async()=>{
 const f=fixture();try{
  fs.mkdirSync(f.file);fs.writeFileSync(path.join(f.file,'sentinel'),'unchanged');
  await assert.rejects(encodeVideo({file:f.file,command:process.execPath,args:['-e',"const fs=require('node:fs');process.stdin.resume();process.stdin.on('end',()=>fs.writeFileSync(process.argv[1],'complete video'));"],frameCount:1,frame:()=>Buffer.alloc(4)}),/EISDIR|EPERM|EEXIST/);
  assert.equal(fs.readFileSync(path.join(f.file,'sentinel'),'utf8'),'unchanged');
  assert.deepEqual(fs.readdirSync(f.dir).sort(),['bin','film.mp4']);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});
