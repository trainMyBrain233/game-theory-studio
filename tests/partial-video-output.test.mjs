import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {renderOptions} from '../production/src/render-options.mjs';
import {pythonCommand,ROOT} from '../scripts/python.mjs';

const full=width=>`output/game_theory_textbook_v2_clean_${width}.mp4`;
test('partial windows require an independent explicit output; complete, preview and still defaults survive',()=>{
 for(const args of [['--duration','.1'],['--start','1'],['--start','1','--duration','2']]){
  assert.throws(()=>renderOptions(args,173.3),/Partial video renders require an explicit --out/);
  const options=renderOptions([...args,'--out','output/segment.mp4'],173.3);
  assert.equal(options.file,'output/segment.mp4');
 }
 for(const args of [[],['--start','0'],['--duration','173.3'],['--start','0','--duration','173.3']]){
  for(const width of [1920,3840])assert.equal(renderOptions([...args,'--width',String(width)],173.3).file,full(width));
 }
 assert.equal(renderOptions(['--out','movie.mp4'],173.3).file,'movie.mp4');
 assert.equal(renderOptions(['--preview'],173.3).file,'output/transition_preview_1920.mp4');
 assert.equal(renderOptions(['--preview','--duration','.1'],173.3).frameCount,3);
 assert.deepEqual(renderOptions(['--stills'],173.3,{defaultTimes:[1,2]}).times,[1,2]);
 for(const out of ['', '   '])assert.throws(()=>renderOptions(['--duration','.1','--out',out],173.3),/--out must name an output file/);
 for(const width of [1920,3840])for(const out of [full(width),`./output/../${full(width)}`,path.resolve(full(width))]){
  assert.throws(()=>renderOptions(['--duration','.1','--out',out],173.3),/canonical full-film output/);
  assert.throws(()=>renderOptions(['--preview','--out',out],173.3),/canonical full-film output/);
 }
 for(const args of [['--start','173.3'],['--start','172','--duration','2'],['--duration','NaN']])assert.throws(()=>renderOptions([...args,'--out','segment.mp4'],173.3),/inside the episode/);
 assert.throws(()=>renderOptions(['--duration','.01'],173.3),/at least one frame/,'Quantization errors retain their intended validation boundary.');
});

test('real renderer refuses unsafe partial outputs before encoder/assets/Canvas and preserves existing full films',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'partial-video-boundary-'));
 try{
  fs.mkdirSync(path.join(dir,'output'));
  for(const width of [1920,3840])fs.writeFileSync(path.join(dir,full(width)),`full-film sentinel ${width}`);
  const windows=[['--duration','.1'],['--start','1'],['--start','1','--duration','.1']];
  for(const args of [...windows,...windows.flatMap(window=>[1920,3840].flatMap(width=>[
   [...window,'--out',full(width)],
   [...window,'--out',path.join(dir,full(width))],
   [...window,'--out',`./output/../${full(width)}`],
  ])),['--preview','--out',full(1920)]]){
   const run=spawnSync(process.execPath,['--loader',path.join(ROOT,'tests/fixtures/render-boundary-stubs-loader.mjs'),path.join(ROOT,'production/render.mjs'),...args],{cwd:dir,env:{...process.env,PYTHON:pythonCommand()},encoding:'utf8'});
   assert.ifError(run.error);assert.notEqual(run.status,0);
   assert.match(run.stderr,/Partial video renders (require an explicit --out|cannot use a canonical full-film output)/);
   assert.doesNotMatch(run.stderr,/boundary reached/,'No encoding, assets or drawing may start.');
   for(const width of [1920,3840])assert.equal(fs.readFileSync(path.join(dir,full(width)),'utf8'),`full-film sentinel ${width}`);
   assert.deepEqual(fs.readdirSync(path.join(dir,'output')).sort(),[1920,3840].map(width=>path.basename(full(width))));
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('real renderer publishes explicit partial videos through the real encoder helper without replacing full films',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'partial-video-publication-'));
 try{
  const bin=path.join(dir,'bin');fs.mkdirSync(bin);fs.mkdirSync(path.join(dir,'output'));
  fs.copyFileSync(path.join(ROOT,'tests/fixtures/publication-encoder.mjs'),path.join(bin,'ffmpeg'));fs.chmodSync(path.join(bin,'ffmpeg'),0o755);
  for(const width of [1920,3840])fs.writeFileSync(path.join(dir,full(width)),`full-film sentinel ${width}`);
  const file=path.join(dir,'segment.mp4'),record=path.join(dir,'encoder.json');
  for(const args of [['--duration','.1'],['--start','9.9'],['--start','1','--duration','.1']]){
   fs.writeFileSync(file,'old segment sentinel');
   const run=spawnSync(process.execPath,['--loader',path.join(ROOT,'tests/fixtures/video-publication-loader.mjs'),path.join(ROOT,'production/render.mjs'),...args,'--out',file],{cwd:dir,env:{...process.env,PYTHON:pythonCommand(),PATH:`${bin}${path.delimiter}${process.env.PATH}`,ENCODER_MODE:'success',ENCODER_RECORD:record},encoding:'utf8',timeout:10000});
   assert.ifError(run.error);assert.equal(run.status,0,run.stdout+run.stderr);
   assert.equal(fs.readFileSync(file,'utf8'),'complete video');
   for(const width of [1920,3840])assert.equal(fs.readFileSync(path.join(dir,full(width)),'utf8'),`full-film sentinel ${width}`);
   assert.notEqual(JSON.parse(fs.readFileSync(record)).at(-1),file,'The real helper still publishes atomically via a temporary path.');
   assert.deepEqual(fs.readdirSync(dir).filter(name=>name.startsWith('.segment')),[]);
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
