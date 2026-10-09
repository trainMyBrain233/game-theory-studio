import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {deflateSync} from 'node:zlib';
import {renderOptions,videoFrameCount} from '../production/src/render-options.mjs';
import {proposalScale} from '../design/canvas-geometry.mjs';
import {checkpointPlan,createStillsManifest,verifyStillsManifest,stampCheckpointPng,sha256,STILLS_MANIFEST,TIMELINE_PATH} from '../production/src/checkpoints.mjs';
import {withSourceFixture} from '../scripts/source-fixture.mjs';
import {pythonCommand,ROOT} from '../scripts/python.mjs';

function fixturePng(width=1920,height=1080,iend=Buffer.alloc(0)) {
 const crc32=bytes=>{let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;};
 const chunk=(type,bytes)=>{const kind=Buffer.from(type),header=Buffer.alloc(4),crc=Buffer.alloc(4);header.writeUInt32BE(bytes.length);crc.writeUInt32BE(crc32(Buffer.concat([kind,bytes])));return Buffer.concat([header,kind,bytes,crc]);};
 const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.alloc((width*4+1)*height))),chunk('IEND',iend)]);
}
const PNG=fixturePng();

const timelineBytes=()=>fs.readFileSync(path.join(ROOT,TIMELINE_PATH));
const timeline=()=>JSON.parse(timelineBytes());

test('CLI and encoder count contract reject explicit and trailing zero-frame windows',()=>{
 for(const args of [['--duration','0.01'],['--start','174.09']])assert.throws(()=>renderOptions(args,174.1),/at least one frame/);
 assert.throws(()=>videoFrameCount(.01,30),/at least one frame/);
 for(const [seconds,fps] of [[0,30],[Infinity,30],[1,0],[1,NaN],[Number.MAX_VALUE,30]])assert.throws(()=>videoFrameCount(seconds,fps));
 const options=renderOptions(['--start','10','--duration','0.04'],174.1,{fps:30});
 assert.equal(options.frameCount,1);
 assert.equal(videoFrameCount(13,30),390);
 assert.equal(videoFrameCount(.02,30),1,'The contract rejects zero quantized frames, not every mathematical sub-frame duration.');
 assert.equal(renderOptions(['--duration','.01'],174.1,{fps:120}).frameCount,1,'The contract follows the configured FPS.');
});

test('proposal geometry allows a single uniform scale and rejects stretched canvases',()=>{
 for(const [width,height,scale] of [[1920,1080,1],[3840,2160,2],[960,540,.5],[1280,720,2/3]])assert.equal(proposalScale(width,height),scale);
 for(const [width,height] of [[1080,1080],[1920,1000],[3840,1080],[0,0],[-1920,-1080],[NaN,1080],[1920,Infinity],[19.2,10.8]])assert.throws(()=>proposalScale(width,height),/16:9/);
});

test('default stills use current semantic anchors, while explicit --times keep their exact values',()=>{
 const current=timeline(),manifest=createStillsManifest(timelineBytes());
 const options=renderOptions(['--stills'],current.duration,{defaultTimes:manifest.checkpoints.map(point=>point.time)});
 assert.deepEqual(options.times,manifest.checkpoints.map(point=>point.time));
 assert.equal(options.frameCount,null);
 assert.equal(options.explicitTimes,false);
 assert.throws(()=>renderOptions(['--stills'],current.duration),/current timeline/);
 const custom=renderOptions(['--stills','--times','0,27.123,172'],current.duration);
 assert.equal(custom.explicitTimes,true);
 assert.deepEqual(custom.times,[0,27.123,172]);
 const explicit=createStillsManifest(timelineBytes(),{times:custom.times,width:3840});
 assert.deepEqual(explicit.checkpoints.map(point=>point.time),custom.times);
 assert(explicit.checkpoints.every(point=>point.group==='custom'));
 assert.equal(explicit.checkpoints[1].file,'frame_27.12_3840.png');
 assert.equal(manifest.timeline.sha256,sha256(timelineBytes()));
});

test('every default checkpoint stays within its live anchor and reading keyframes follow score reveal events',()=>{
 const current=timeline();
 for(const point of checkpointPlan(current)){
  const anchor=current[point.anchor.kind==='section'?'sections':'segments'].find(item=>item.id===point.anchor.id);
  assert(point.time>=anchor.start&&point.time<anchor.end,point.id);
  if(point.group==='keyframes'){
   assert.equal(point.time,anchor.voiceover_end+(anchor.end-anchor.voiceover_end)/2);
   assert.equal(point.label,anchor.voiceover.replace(/\s+/g,' ').trim());
   for(const event of anchor.visual_cue?.score_reveals??[])assert(point.time>=anchor.start+event.offset,point.id);
  }else assert.equal(point.time,anchor.start+point.anchor.offset);
 }
});

test('missing, duplicate or too-short semantic anchors fail rather than falling back to old seconds',()=>{
 const missing=timeline();missing.segments=missing.segments.filter(segment=>segment.id!=='s21_rows');assert.throws(()=>checkpointPlan(missing),/s21_rows/);
 const duplicate=timeline();duplicate.sections.push({...duplicate.sections[0],id:'recap'});assert.throws(()=>checkpointPlan(duplicate),/exactly one section/);
 const short=timeline();const rows=short.segments.find(segment=>segment.id==='s21_rows');rows.end=rows.start+.1;assert.throws(()=>checkpointPlan(short),/outside its current anchor/);
 assert.throws(()=>createStillsManifest(timelineBytes(),{times:[1,1.001]}),/unique two-decimal/);
});

function readBoardContract(output,timelineFile){
 const code=`import importlib.util,json,sys\nspec=importlib.util.spec_from_file_location('contact_sheets',sys.argv[1]); module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)\nmanifest,groups=module.load_checkpoints(sys.argv[2],sys.argv[3])\nprint(json.dumps({'groups':groups,'width':manifest['width']},ensure_ascii=False))`;
 return spawnSync(pythonCommand(),['-c',code,path.join(ROOT,'production/make_contact_sheets.py'),output,timelineFile],{encoding:'utf8',env:{...process.env,NODE:process.execPath}});
}
function fakeCompletedSet(output,bytes,{times}={}){
 const manifest=createStillsManifest(bytes,{times});
 // A small, valid, solid PNG fixture. No native Canvas, fonts or image render.
 for(const point of manifest.checkpoints){const png=stampCheckpointPng(PNG,manifest,point);fs.writeFileSync(path.join(output,point.file),png);point.sha256=sha256(png);}
 fs.writeFileSync(path.join(output,STILLS_MANIFEST),JSON.stringify(manifest));
 return manifest;
}

test('contact sheets consume JS manifest times/labels and reject missing, stale or changed stills without loading fonts',()=>{
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'checkpoint-consumer-'));
 try{
  const source=path.join(output,'timeline.json');fs.writeFileSync(source,timelineBytes());
  assert.match(readBoardContract(output,source).stderr,/Missing stills-manifest/);
  const manifest=fakeCompletedSet(output,timelineBytes());
  const valid=readBoardContract(output,source);assert.equal(valid.status,0,valid.stderr);
  assert.deepEqual(Object.values(JSON.parse(valid.stdout).groups).flat(),manifest.checkpoints);
  const changed=timeline();changed.segments[0].voiceover+=' Changed';fs.writeFileSync(source,JSON.stringify(changed));
  assert.match(readBoardContract(output,source).stderr,/Stale still checkpoint manifest/);
  fs.writeFileSync(source,timelineBytes());
  const first=manifest.checkpoints[0];fs.writeFileSync(path.join(output,first.file),'changed image');
  assert.match(readBoardContract(output,source).stderr,/Missing or changed still frame/);
  fs.rmSync(path.join(output,first.file));assert.match(readBoardContract(output,source).stderr,/Missing or changed still frame/);
  const custom=fakeCompletedSet(output,timelineBytes(),{times:[27.125]});
  const customRead=readBoardContract(output,source);assert.equal(customRead.status,0,customRead.stderr);
  assert.equal(JSON.parse(customRead.stdout).groups.custom[0].file,custom.checkpoints[0].file,'Python consumes the exact JS filename even at rounding ties.');
  assert.equal(JSON.parse(customRead.stdout).groups.custom[0].time_label,'27.13s','The board consumes the same timestamp label as the renderer, including JS rounding ties.');
 }finally{fs.rmSync(output,{recursive:true,force:true});}
});

test('real long-name rebuild moves default keyframes/transitions and rejects the old still set',()=>{
 const originalBytes=timelineBytes(),original=createStillsManifest(originalBytes);
 withSourceFixture(root=>{
  const file=path.join(root,'design/scenes.json'),scene=JSON.parse(fs.readFileSync(file));
  const currentNames=scene.actors.map(actor=>actor.label);
  const nameLength=names=>names.reduce((total,name)=>total+[...name].length,0);
  // Change the total spoken name length as well as the text, so rebuilding an
  // already-long-name case must still move real checkpoints and invalidate it.
  const names=nameLength(currentNames)===8
   ? ['东方明','南宫红'] : ['欧阳小明','司马小红'];
  assert.notDeepEqual(names,currentNames,'The changed fixture must actually change the current names.');
  assert.notEqual(nameLength(names),nameLength(currentNames),'The changed fixture must alter spoken name length.');
  scene.actors.forEach((actor,index)=>{actor.label=names[index];});
  scene.strategies[0].label='合作';scene.strategies[1].label='退出';
  scene.payoffs=[[[11,12],[21,22]],[[31,32],[41,42]]];
  fs.writeFileSync(file,JSON.stringify(scene));
  const out=path.join(root,'artifacts/checkpoint-rebuild');
  const build=spawnSync(pythonCommand(),['chapters/01-four-elements/narration/build_narration.py','--output-dir',out],{cwd:root,encoding:'utf8'});
  assert.equal(build.status,0,build.stdout+build.stderr);
  const bytes=fs.readFileSync(path.join(out,'timeline.json')),rebuilt=JSON.parse(bytes),manifest=createStillsManifest(bytes);
  assert.notEqual(manifest.timeline.sha256,original.timeline.sha256);
  const score=manifest.checkpoints.find(point=>point.id==='s27_rb_score');
  const scoreSegment=rebuilt.segments.find(segment=>segment.id==='s27_rb_score');
  assert.equal(score.time,scoreSegment.voiceover_end+(scoreSegment.end-scoreSegment.voiceover_end)/2);
  assert(names.every(name=>score.label.includes(name)));
  assert.notEqual(score.time,original.checkpoints.find(point=>point.id===score.id).time,'The actual rebuilt payoff checkpoint must move.');
  const transition=manifest.checkpoints.find(point=>point.id==='s21_rows_0.6');
  assert.equal(transition.time,rebuilt.segments.find(segment=>segment.id==='s21_rows').start+.6);
  assert.notEqual(transition.time,original.checkpoints.find(point=>point.id===transition.id).time,'The actual rebuilt transition checkpoint must move.');
  fakeCompletedSet(out,originalBytes);
  assert.match(readBoardContract(out,path.join(out,'timeline.json')).stderr,/Stale still checkpoint manifest/);
  fakeCompletedSet(out,bytes);
  const valid=readBoardContract(out,path.join(out,'timeline.json'));assert.equal(valid.status,0,valid.stderr);
  assert.deepEqual(Object.values(JSON.parse(valid.stdout).groups).flat(),manifest.checkpoints.map(point=>({...point,sha256:sha256(stampCheckpointPng(PNG,manifest,point))})));
 });
 assert.equal(sha256(timelineBytes()),sha256(originalBytes),'QA must not rewrite the tracked timeline.');
});

test('real renderer rejects zero-frame CLI windows before encoder, assets or Canvas boundaries (all native imports stubbed)',()=>{
 const loader=path.join(ROOT,'tests/fixtures/render-boundary-stubs-loader.mjs');
 const current=timeline();
 for(const args of [['--duration','0.01'],['--start',String(current.duration-.01)]]){
  const result=spawnSync(process.execPath,['--loader',loader,path.join(ROOT,'production/render.mjs'),...args],{cwd:os.tmpdir(),encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/at least one frame/);
  assert.doesNotMatch(result.stderr,/boundary reached/);
 }
});

test('real drawScene rejects stretched geometry before its context boundary (native/font imports stubbed)',()=>{
 const loader=path.join(ROOT,'tests/fixtures/render-boundary-stubs-loader.mjs');
 const source=`import {drawScene} from ${JSON.stringify(new URL('../design/render-proposals.mjs',import.meta.url).href)};for(const [width,height] of [[1920,1000],[1080,1080]]){try{drawScene({width,height,getContext(){throw Error('Context boundary reached')}},'textbook','participants');throw Error('Expected geometry rejection')}catch(error){if(!/16:9/.test(error.message))throw error}}`;
 const result=spawnSync(process.execPath,['--loader',loader,'--input-type=module','-e',source],{cwd:os.tmpdir(),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});

test('shared metadata verifier rejects altered default/custom labels, times, filenames, anchors and producer modes',()=>{
 for(const options of [{},{times:[27.125,83]}]){
  const original=createStillsManifest(timelineBytes(),options);
  original.checkpoints.forEach(point=>point.sha256=sha256(PNG));
  assert.equal(verifyStillsManifest(original,timelineBytes()),original);
  for(const mutate of [
   manifest=>{manifest.checkpoints[0].label='伪造标签';},
   manifest=>{manifest.checkpoints[0].time_label='999.00s';},
   manifest=>{manifest.checkpoints[0].time+=.001;},
   manifest=>{manifest.checkpoints[0].file='other.png';},
   manifest=>{manifest.checkpoints[0].group='transitions';},
   manifest=>{manifest.checkpoints[0].anchor.phase='wrong';},
   manifest=>{manifest.checkpoints.push({...manifest.checkpoints[0]});},
   manifest=>{manifest.checkpoints.pop();},
   manifest=>{manifest.mode=manifest.mode==='custom'?'default':'custom';},
   manifest=>{manifest.mode='unknown';},
   manifest=>{manifest.explicit_times=[27.2];},
  ]){
   const changed=structuredClone(original);mutate(changed);
   assert.throws(()=>verifyStillsManifest(changed,timelineBytes()),/checkpoint|Checkpoint|Still|still|Explicit/);
  }
 }
});

test('contact sheet entrypoint rejects tampered metadata, image escape symlinks, duplicate and non-PNG inputs',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'checkpoint-boundaries-')),output=path.join(root,'output');fs.mkdirSync(output);
 const source=path.join(root,'timeline.json');fs.writeFileSync(source,timelineBytes());
 try{
  let manifest=fakeCompletedSet(output,timelineBytes(),{times:[27.125]});
  let result=readBoardContract(output,source);assert.equal(result.status,0,result.stderr);
  const manifestFile=path.join(output,STILLS_MANIFEST);
  for(const [field,value] of [['label','伪造文字'],['time_label','0.00s'],['group','keyframes'],['time',27.126],['file','../outside.png'],['file',path.join(root,'outside.png')]]){
   const changed=structuredClone(manifest);changed.checkpoints[0][field]=value;fs.writeFileSync(manifestFile,JSON.stringify(changed));
   result=readBoardContract(output,source);assert.notEqual(result.status,0);assert.match(result.stderr,/metadata differs/);
  }
  // Even a self-consistent new custom request cannot relabel unchanged PNGs.
  const retimed=structuredClone(manifest);retimed.explicit_times[0]=27.126;retimed.checkpoints[0].time=27.126;
  assert.equal(verifyStillsManifest(retimed,timelineBytes()),retimed,'The new request is internally valid and remains in the same anchor.');
  fs.writeFileSync(manifestFile,JSON.stringify(retimed));
  assert.match(readBoardContract(output,source).stderr,/PNG checkpoint metadata differs/);
  fs.writeFileSync(manifestFile,JSON.stringify(manifest));
  const point=manifest.checkpoints[0],file=path.join(output,point.file),outside=path.join(root,'outside.png');fs.writeFileSync(outside,PNG);
  fs.rmSync(file);fs.symlinkSync(outside,file);
  result=readBoardContract(output,source);assert.notEqual(result.status,0);assert.match(result.stderr,/symlink escapes the output directory/);
  fs.rmSync(file);fs.writeFileSync(file,PNG);
  const duplicate=structuredClone(manifest);duplicate.checkpoints.push({...duplicate.checkpoints[0]});fs.writeFileSync(manifestFile,JSON.stringify(duplicate));
  assert.match(readBoardContract(output,source).stderr,/metadata differs/);
  fs.writeFileSync(file,PNG);manifest.checkpoints[0].sha256=sha256(PNG);fs.writeFileSync(manifestFile,JSON.stringify(manifest));
  assert.match(readBoardContract(output,source).stderr,/PNG checkpoint metadata differs/,'Unstamped legacy PNGs cannot acquire current labels by manifest editing.');
  const invalid=Buffer.from('not a PNG');fs.writeFileSync(file,invalid);manifest.checkpoints[0].sha256=sha256(invalid);fs.writeFileSync(manifestFile,JSON.stringify(manifest));
  assert.match(readBoardContract(output,source).stderr,/not a PNG/);
  const wrongSize=fixturePng(1,1);fs.writeFileSync(file,wrongSize);manifest.checkpoints[0].sha256=sha256(wrongSize);fs.writeFileSync(manifestFile,JSON.stringify(manifest));
  assert.match(readBoardContract(output,source).stderr,/PNG structure or dimensions/);
  const corrupt=Buffer.from(PNG);corrupt[corrupt.length-1]^=1;fs.writeFileSync(file,corrupt);manifest.checkpoints[0].sha256=sha256(corrupt);fs.writeFileSync(manifestFile,JSON.stringify(manifest));
  assert.match(readBoardContract(output,source).stderr,/PNG chunk checksum/);
  const nonemptyIend=fixturePng(1920,1080,Buffer.from([0]));fs.writeFileSync(file,nonemptyIend);manifest.checkpoints[0].sha256=sha256(nonemptyIend);fs.writeFileSync(manifestFile,JSON.stringify(manifest));
  assert.match(readBoardContract(output,source).stderr,/PNG IEND must be empty/,'A CRC-valid nonempty IEND must still be rejected.');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('PNG reader directly refuses absolute and traversal paths before accessing outside files',()=>{
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'checkpoint-paths-'));
 try{
  for(const filename of ['../outside.png','nested/../../outside.png','/outside.png','C:' + String.fromCharCode(92) + 'outside.png']){
   const code=`import importlib.util,sys\nspec=importlib.util.spec_from_file_location('contact_sheets',sys.argv[1]); module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)\nmodule.read_frame_bytes(sys.argv[2],{'file':sys.argv[3],'sha256':'unused'},(1920,1080))`;
   const result=spawnSync(pythonCommand(),['-c',code,path.join(ROOT,'production/make_contact_sheets.py'),output,filename],{encoding:'utf8'});
   assert.notEqual(result.status,0);assert.match(result.stderr,/path must be a PNG basename/);
  }
 }finally{fs.rmSync(output,{recursive:true,force:true});}
});
