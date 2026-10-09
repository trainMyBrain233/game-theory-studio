import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {withSourceFixture} from '../scripts/source-fixture.mjs';
import {validateFirstEpisodeTimeline} from '../scripts/validate-data.mjs';
import {checkpointPlan,verifyStillsManifest,sha256,TIMELINE_PATH,STILLS_MANIFEST} from '../production/src/checkpoints.mjs';
import {renderOptions} from '../production/src/render-options.mjs';

function retime(timeline,factor){
 timeline.duration*=factor;
 for(const section of timeline.sections)for(const key of ['start','end'])section[key]*=factor;
 for(const segment of timeline.segments){
  for(const key of ['start','end','voiceover_end','spoken_duration','pause_after','display_duration'])segment[key]*=factor;
  for(const event of segment.visual_cue.score_reveals??[])event.offset*=factor;
 }
 return timeline;
}
function run(root,args){
 const callsFile=path.join(root,'cli-calls.jsonl');fs.rmSync(callsFile,{force:true});
 const result=spawnSync(process.execPath,['--loader',path.join(root,'tests/fixtures/render-lazy-checkpoints-loader.mjs'),path.join(root,'production/render.mjs'),...args],{cwd:root,encoding:'utf8',env:{...process.env,CLI_CALLS:callsFile}});
 return {...result,calls:fs.existsSync(callsFile)?fs.readFileSync(callsFile,'utf8').trim().split('\n').map(JSON.parse):[]};
}

test('lazy defaultTimes is evaluated only for default still requests',()=>{
 let calls=0;const defaults=()=>{calls++;return [1,2];};
 assert.deepEqual(renderOptions([],10,{defaultTimes:defaults}).times,[]);
 assert.deepEqual(renderOptions(['--stills','--times','3'],10,{defaultTimes:defaults}).times,[3]);
 assert.equal(calls,0);
 assert.deepEqual(renderOptions(['--stills'],10,{defaultTimes:[4,5]}).times,[4,5],'Existing array callers remain supported.');
 for(const value of ['', 'NaN', 'Infinity', '1,'])assert.throws(()=>renderOptions(['--stills','--times',value],10,{defaultTimes:defaults}),/Still times must be finite/);
 assert.equal(calls,0,'Even malformed explicit times must not invoke the default callback.');
 assert.deepEqual(renderOptions(['--stills'],10,{defaultTimes:defaults}).times,[1,2]);
 assert.equal(calls,1);
 assert.throws(()=>renderOptions(['--stills'],10,{defaultTimes:()=>[10]}),/inside the episode/);
});

test('actual CLI accepts 0.3x custom stills and video without evaluating invalid default checkpoints (drawing/encoder simulated)',()=>{
 withSourceFixture(root=>{
  const file=path.join(root,TIMELINE_PATH),timeline=retime(JSON.parse(fs.readFileSync(file)),.3);
  const scenes=JSON.parse(fs.readFileSync(path.join(root,'design/scenes.json')));
  validateFirstEpisodeTimeline(timeline,scenes);
  assert.throws(()=>checkpointPlan(timeline),/outside its current anchor: s18_return_single_round/);
  const bytes=Buffer.from(JSON.stringify(timeline));fs.writeFileSync(file,bytes);
  const times=[0,timeline.segments.find(segment=>segment.id==='s18_return_single_round').start+.1];
  const custom=run(root,['--stills','--placeholder-cast','--times',times.join(',')]);
  assert.equal(custom.status,0,custom.stdout+custom.stderr);
  assert.deepEqual(custom.calls.filter(call=>call[0]==='draw').map(call=>call[1]),times);
  assert(!custom.calls.some(call=>call[0].startsWith('encoder')));
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'output',STILLS_MANIFEST)));
  assert.equal(manifest.mode,'custom');assert.deepEqual(manifest.explicit_times,times);
  verifyStillsManifest(manifest,bytes);
  for(const point of manifest.checkpoints){assert.equal(point.group,'custom');assert.equal(point.sha256,sha256(fs.readFileSync(path.join(root,'output',point.file))));}
  for(const args of [[],['--start','1','--duration','0.04'],['--preview']]){
   const result=run(root,args);assert.equal(result.status,0,result.stdout+result.stderr);
   const options=renderOptions(args,timeline.duration);
   assert.equal(result.calls.filter(call=>call[0]==='encoded-frame').length,options.frameCount);
   assert.deepEqual(result.calls.filter(call=>call[0]==='draw').map(call=>call[1]),Array.from({length:options.frameCount},(_,i)=>options.start+i/30));
   assert(result.calls.some(call=>call[0]==='encoder'));
  }
  const defaults=run(root,['--stills']);assert.notEqual(defaults.status,0);
  assert.match(defaults.stderr,/outside its current anchor: s18_return_single_round/);
  assert.deepEqual(defaults.calls,[],'Invalid default anchors fail before assets, Canvas or encoder.');
  for(const [args,message] of [
   [['--stills','--times',String(timeline.duration)],/Still times must be finite and inside the episode/],
   [['--stills','--times',''],/Still times must be finite and inside the episode/],
   [['--stills','--times','NaN'],/Still times must be finite and inside the episode/],
   [['--stills','--times','-1'],/Still times must be finite and inside the episode/],
   [['--duration',String(timeline.duration+1)],/Video window must be finite, positive and inside the episode/],
   [['--duration','0.01'],/at least one frame/],
  ]){
   const result=run(root,args);assert.notEqual(result.status,0);assert.match(result.stderr,message);assert.deepEqual(result.calls,[]);
  }
 });
});

test('actual CLI still produces default semantic checkpoints for a fitting timeline (drawing simulated)',()=>{
 withSourceFixture(root=>{
  const bytes=fs.readFileSync(path.join(root,TIMELINE_PATH));
  const expected=checkpointPlan(JSON.parse(bytes));
  const result=run(root,['--stills']);assert.equal(result.status,0,result.stdout+result.stderr);
  assert.deepEqual(result.calls.filter(call=>call[0]==='draw').map(call=>call[1]),expected.map(point=>point.time));
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'output',STILLS_MANIFEST)));
  assert.equal(manifest.mode,'default');verifyStillsManifest(manifest,bytes);
 });
});
