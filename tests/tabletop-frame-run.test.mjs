import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {withSourceFixture} from '../scripts/source-fixture.mjs';
import {pythonCommand} from '../scripts/python.mjs';

const available=['ffmpeg','ffprobe'].every(command=>spawnSync(command,['-version'],{stdio:'ignore'}).status===0);
for(const interaction of [true,false])test(`tabletop ${interaction?'interaction':'flat'} entry isolates long, short, and failed runs`,{skip:!available},()=>{
 withSourceFixture(root=>{
  const out=path.join(root,`artifacts/tabletop-${interaction?'interaction':'flat-regression'}`),frames=path.join(out,'frames');
  fs.mkdirSync(frames,{recursive:true});
  // An old continuous sequence must never be consulted (these are deliberately
  // invalid PNGs, so merely bounding FFmpeg's input to N frames is insufficient).
  for(let i=0;i<12;i++)fs.writeFileSync(path.join(frames,`${String(i).padStart(4,'0')}.png`),'historical frame');
  fs.writeFileSync(path.join(frames,'keep-me.txt'),'user file');
  const movie=path.join(out,interaction?'original-tabletop-cycle.mp4':'flat-unselected-pose.mp4'),report=path.join(out,interaction?'review.json':'clip-manifest.json');
  const run=(count,extra={})=>spawnSync(process.execPath,['--loader',path.join(root,'tests/fixtures/tabletop-frame-run-loader.mjs'),path.join(root,`design/experiments/tabletop/render${interaction?'-interaction':''}.mjs`),'--placeholder-cast',...interaction?[]:['--flat-regression']],{cwd:root,env:{...process.env,PYTHON:pythonCommand(),TABLETOP_TEST_FRAMES:String(count),...extra},encoding:'utf8',timeout:20000});
  for(const count of [8,3]){
   const result=run(count);assert.equal(result.status,0,result.stdout+result.stderr);assert.ifError(result.error);
   const probe=spawnSync('ffprobe',['-v','error','-count_frames','-show_entries','stream=nb_read_frames,duration,r_frame_rate','-of','json',movie],{encoding:'utf8'});
   assert.equal(probe.status,0,probe.stderr);
   const stream=JSON.parse(probe.stdout).streams[0],manifest=JSON.parse(fs.readFileSync(report));
   assert.equal(Number(stream.nb_read_frames),count);assert.equal(Number(stream.duration),count/10);assert.equal(stream.r_frame_rate,'10/1');
   assert.equal(manifest.frameCount??manifest.frames,count);assert.equal(manifest.duration,Number(stream.duration));
   assert.deepEqual(fs.readdirSync(out).filter(name=>name.startsWith('.tabletop-run-')),[]);
  }
  const oldMovie=fs.readFileSync(movie),oldReport=fs.readFileSync(report);
  const bin=path.join(root,'test-bin');fs.mkdirSync(bin);
  const fake=path.join(bin,'ffmpeg');
  for(const mode of ['draw','encode','decode']){
   // Decode mode writes a staged movie then fails during full decode; the old
   // published movie and its success report must remain byte-identical.
   fs.writeFileSync(fake,`#!${process.execPath}\nimport fs from 'node:fs';const args=process.argv.slice(2);if(${JSON.stringify(mode)}==='decode'&&args.includes('-y')){fs.writeFileSync(args.at(-1),'staged invalid movie');process.exit(0);}process.stderr.write('intentional ${mode} failure');process.exit(7);\n`,{mode:0o755});
   const result=run(2,{PATH:`${bin}${path.delimiter}${process.env.PATH}`,...mode==='draw'?{TABLETOP_TEST_DRAW_FAIL:'1'}:{}});
   assert.notEqual(result.status,0);assert.match(result.stderr,mode==='draw'?/intentional tabletop draw failure/:mode==='decode'?/Full decode failed: intentional decode failure/:/FFmpeg failed: intentional encode failure/);
   assert.deepEqual(fs.readFileSync(movie),oldMovie);assert.deepEqual(fs.readFileSync(report),oldReport);
   assert.deepEqual(fs.readdirSync(out).filter(name=>name.startsWith('.tabletop-run-')),[]);
  }
  assert.equal(fs.readdirSync(frames).length,13);assert.equal(fs.readFileSync(path.join(frames,'0011.png'),'utf8'),'historical frame');assert.equal(fs.readFileSync(path.join(frames,'keep-me.txt'),'utf8'),'user file');
 });
});
