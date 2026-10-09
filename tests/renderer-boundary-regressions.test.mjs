import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {checkpointPlan,createStillsManifest,verifyStillsManifest,sha256} from '../production/src/checkpoints.mjs';
import {validateTimeline} from '../scripts/validate-data.mjs';

const read=relative=>JSON.parse(fs.readFileSync(new URL(relative,import.meta.url)));
const timeline=()=>read('../chapters/01-four-elements/narration/timeline.json');
const scenes=read('../design/scenes.json');
function zeroPauses(){
 const current=timeline();
 for(const segment of current.segments){
  segment.voiceover_end=segment.end;
  segment.spoken_duration=segment.end-segment.start;
  segment.pause_after=0;
 }
 validateTimeline(current,scenes);
 return current;
}

test('schema-valid zero-pause keyframes sample the final representable time inside their own segment',()=>{
 const current=zeroPauses(),plan=checkpointPlan(current);
 for(const point of plan.filter(point=>point.group==='keyframes')){
  const segment=current.segments.find(segment=>segment.id===point.id);
  assert.equal(point.anchor.phase,'segment_end_interior');
  assert(point.time>=segment.start&&point.time<segment.end,point.id);
  const bits=new DataView(new ArrayBuffer(8));bits.setFloat64(0,point.time);
  bits.setBigUint64(0,bits.getBigUint64(0)+1n);
  assert.equal(bits.getFloat64(0),segment.end,'No representable time may fall between the sample and exclusive end.');
  for(const event of segment.visual_cue.score_reveals??[])assert(point.time>=segment.start+event.offset);
 }
 const bytes=Buffer.from(JSON.stringify(current)),manifest=createStillsManifest(bytes);
 manifest.checkpoints.forEach(point=>point.sha256=sha256(Buffer.from(point.id)));
 assert.equal(verifyStillsManifest(manifest,bytes),manifest);
 assert.deepEqual(verifyStillsManifest(JSON.parse(JSON.stringify(manifest)),bytes),manifest,'Serialized checkpoint identities must reverify without rounding changes.');
});

test('zero-pause endpoint reveals are rejected by the display-window contract',()=>{
 const current=zeroPauses(),segment=current.segments.find(segment=>segment.id==='s25_rr_score');
 segment.visual_cue.score_reveals[1].offset=segment.spoken_duration;
 assert.equal(segment.start+segment.visual_cue.score_reveals[1].offset,segment.end);
 assert.throws(()=>validateTimeline(current,scenes),{
  name:'AssertionError',
  message:/s25_rr_score: score reveal must occur within the segment display window/,
 });
});

test('valid zero-pause sampling stays in its segment without claiming a last-instant reveal has completed',()=>{
 const current=zeroPauses(),segment=current.segments.find(segment=>segment.id==='s25_rr_score');
 const bits=new DataView(new ArrayBuffer(8));bits.setFloat64(0,segment.end);
 bits.setBigUint64(0,bits.getBigUint64(0)-1n);const revealTime=bits.getFloat64(0);
 segment.visual_cue.score_reveals[1].offset=revealTime-segment.start;
 assert.equal(segment.start+segment.visual_cue.score_reveals[1].offset,revealTime);
 assert(revealTime>=segment.start&&revealTime<segment.end);
 validateTimeline(current,scenes);
 const point=checkpointPlan(current).find(point=>point.id===segment.id);
 // A sample at the reveal onset proves segment ownership, not animation completion.
 assert.equal(point.time,revealTime);
 assert.equal(point.time-revealTime,0);
 assert.equal(point.anchor.phase,'segment_end_interior');
 assert.equal(current.segments.find(item=>point.time>=item.start&&point.time<item.end),segment);
 const next=current.segments[current.segments.indexOf(segment)+1];
 assert.equal(segment.end,next.start);
 assert(point.time<next.start);
});

test('tiny schema-valid final segments retain an in-window sample with zero or positive pause',()=>{
 for(const kind of ['nanosecond','one-ulp','positive-pause']){
  const current=timeline(),segment=current.segments.at(-1),previous=current.segments.at(-2);
  const bits=new DataView(new ArrayBuffer(8));bits.setFloat64(0,segment.end);
  const endBits=bits.getBigUint64(0);
  bits.setBigUint64(0,endBits-1n);const beforeEnd=bits.getFloat64(0);
  bits.setBigUint64(0,endBits-2n);const twoBeforeEnd=bits.getFloat64(0);
  segment.start=kind==='nanosecond'?segment.end-1e-9:kind==='one-ulp'?beforeEnd:twoBeforeEnd;
  segment.voiceover_end=kind==='positive-pause'?beforeEnd:segment.end;
  segment.spoken_duration=segment.voiceover_end-segment.start;
  segment.pause_after=segment.end-segment.voiceover_end;
  segment.display_duration=segment.end-segment.start;
  previous.end=segment.start;
  previous.pause_after=previous.end-previous.voiceover_end;
  previous.display_duration=previous.end-previous.start;
  validateTimeline(current,scenes);
  const point=checkpointPlan(current).find(point=>point.id===segment.id);
  assert(point.time>=segment.start&&point.time<segment.end,kind);
  assert.equal(point.anchor.phase,kind==='positive-pause'?'reading_pause_midpoint':'segment_end_interior');
  if(kind!=='positive-pause')assert.equal(point.time,beforeEnd);
  if(kind==='one-ulp')assert.equal(point.time,segment.start,'The smallest representable positive window has only its start available.');
  const bytes=Buffer.from(JSON.stringify(current)),manifest=createStillsManifest(bytes);
  manifest.checkpoints.forEach(point=>point.sha256=sha256(Buffer.from(point.id)));
  assert.deepEqual(verifyStillsManifest(JSON.parse(JSON.stringify(manifest)),bytes),manifest);
 }
});

test('positive-pause defaults retain their exact sampling times and anchor semantics',()=>{
 const current=timeline();validateTimeline(current,scenes);
 for(const point of checkpointPlan(current).filter(point=>point.group==='keyframes')){
  const segment=current.segments.find(segment=>segment.id===point.id);
  assert.equal(point.time,segment.voiceover_end+(segment.end-segment.voiceover_end)/2);
  assert.equal(point.anchor.phase,'reading_pause_midpoint');
 }
});

test('checkpoint fallback never repairs a malformed speech window or weakens timeline validation',()=>{
 for(const value of [NaN,Infinity,-Infinity,-1]){
  const current=timeline();current.segments[0].voiceover_end=value;
  assert.throws(()=>checkpointPlan(current),/Invalid checkpoint speech window/);
 }
 const current=timeline();current.segments[0].voiceover_end=current.segments[0].end+.01;
 assert.throws(()=>checkpointPlan(current),/Invalid checkpoint speech window/);
 const invalid=zeroPauses();invalid.segments[0].pause_after=-.01;
 assert.throws(()=>validateTimeline(invalid,scenes));
});

test('real drawFrame rejects nonfinite or coercible times before any state or context access',()=>{
 const source=`
  import assert from 'node:assert/strict';
  import {drawFrame,DURATION} from ${JSON.stringify(new URL('../production/src/scenes.mjs',import.meta.url).href)};
  import {calls,prepareAssets} from ${JSON.stringify(new URL('../production/src/primitives.mjs',import.meta.url).href)};
  await prepareAssets();
  const canvas={width:1920,height:1080,getContext(){calls.push(['getContext']);throw Error('Context boundary reached');}};
  for(const time of [NaN,Infinity,-Infinity,undefined,null,'1',true,{}]){
   calls.length=0;
   assert.throws(()=>drawFrame(canvas,time),/Frame time must be a finite number/);
   assert.deepEqual(calls,[],'Invalid times cannot reset records, touch actors or obtain a drawing context.');
  }
  const bits=new DataView(new ArrayBuffer(8));bits.setFloat64(0,DURATION);bits.setBigUint64(0,bits.getBigUint64(0)-1n);const lastTime=bits.getFloat64(0);
  for(const [time,expected] of [[-1,0],[0,0],[12.5,12.5],[DURATION-1/30,DURATION-1/30],[DURATION,lastTime],[Number.MAX_VALUE,lastTime],[-Number.MAX_VALUE,0]]){
   calls.length=0;
   assert.throws(()=>drawFrame(canvas,time),/Context boundary reached/);
   assert.deepEqual(calls,[['resetRecords'],['setSceneTime',expected],['getContext']]);
  }
 `;
 const result=spawnSync(process.execPath,['--loader',new URL('./fixtures/frame-time-stubs-loader.mjs',import.meta.url).pathname,'--input-type=module','-e',source],{cwd:os.tmpdir(),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
