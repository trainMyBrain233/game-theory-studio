import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import {beforeEnd} from '../production/src/frame-time.mjs';

const moduleUrl=relative=>JSON.stringify(new URL(relative,import.meta.url).href);
function run(body){
 const result=spawnSync(process.execPath,['--loader',new URL('./fixtures/tail-frame-recording-loader.mjs',import.meta.url).pathname,'--input-type=module','-e',`
  import assert from 'node:assert/strict';
  import {timeline,sceneData,TOKENS} from ${moduleUrl('../production/src/model.mjs')};
  import {validateFirstEpisodeTimeline} from ${moduleUrl('../scripts/validate-data.mjs')};
  import {createStillsManifest} from ${moduleUrl('../production/src/checkpoints.mjs')};
  import {calls,prepareAssets} from ${moduleUrl('../production/src/primitives.mjs')};
  await prepareAssets();
  function previous(value){const bits=new DataView(new ArrayBuffer(8));bits.setFloat64(0,value);bits.setBigUint64(0,bits.getBigUint64(0)-1n);return bits.getFloat64(0);}
  const context={save(){},restore(){},setTransform(){},fillRect(){}};
  const canvas={width:1920,height:1080,getContext(){return context;}};
  ${body}
 `],{cwd:os.tmpdir(),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
}

test('drawFrame preserves distinct valid final instants in scene state and progress drawing',()=>run(`
 const {drawFrame,DURATION}=await import(${moduleUrl('../production/src/scenes.mjs')});
 const times=[0,12.5,DURATION-1/30,DURATION-.02,DURATION-.001,previous(DURATION)];
 const observed=[];
 for(const time of [...times,...times.toReversed()]){
  drawFrame(canvas,time);
  assert.equal(calls.find(call=>call[0]==='time')[1],time);
  const progress=calls.filter(call=>call[0]==='line'&&call[1]===84&&call[2]===936&&call[4]===936).at(-1);
  assert.equal(progress[3],84+time/DURATION*1752,'Actual progress geometry must use the requested instant.');
  observed.push(JSON.stringify(calls));
 }
 assert.deepEqual(observed.slice(0,times.length),observed.slice(times.length).reverse(),'Drawing is independent of prior frame order.');
 assert.notEqual(observed[3],observed[4],'Valid tail samples must not collapse to a single state.');
`));

for(const kind of ['sub-frame','nanosecond','one-ulp'])test('actual subtitle consumer agrees with the manifest for a '+kind+' closing segment',()=>run(`
 const last=timeline.segments.at(-1),before=timeline.segments.at(-2);
 last.start=${JSON.stringify(kind)}==='sub-frame'?last.end-.02:${JSON.stringify(kind)}==='nanosecond'?last.end-1e-9:previous(last.end);
 last.voiceover_end=last.end;last.spoken_duration=last.end-last.start;last.pause_after=0;last.display_duration=last.end-last.start;
 before.end=last.start;before.pause_after=before.end-before.voiceover_end;before.display_duration=before.end-before.start;
 validateFirstEpisodeTimeline(timeline,sceneData);
 const {drawFrame,DURATION}=await import(${moduleUrl('../production/src/scenes.mjs')});
 const manifest=createStillsManifest(Buffer.from(JSON.stringify(timeline)));
 const point=manifest.checkpoints.find(point=>point.id===last.id);
 assert.equal(point.time,previous(DURATION));
 drawFrame(canvas,point.time);
 assert.equal(calls.find(call=>call[0]==='time')[1],point.time);
 const subtitles=calls.filter(call=>call[0]==='text'&&call[2]===960&&[1010,...TOKENS.spacing.subtitle_baselines].includes(call[3]));
 assert.deepEqual(subtitles.map(call=>call[1]),last.lines,'The real subtitle consumer must select the same closing segment as the manifest.');
 if(${JSON.stringify(kind)}!=='one-ulp')assert(subtitles.every(call=>call[4]>0),'The closing subtitle must have positive applied opacity.');
 drawFrame(canvas,previous(last.start));
 const earlier=calls.filter(call=>call[0]==='text'&&call[2]===960&&[1010,...TOKENS.spacing.subtitle_baselines].includes(call[3]));
 assert.deepEqual(earlier.map(call=>call[1]),before.lines,'The preceding instant must still select the preceding subtitle.');
`));

test('drawFrame clamps finite out-of-range times to exclusive endpoints and rejects nonfinite inputs without drawing',()=>run(`
 const {drawFrame,DURATION}=await import(${moduleUrl('../production/src/scenes.mjs')});
 for(const [time,want] of [[-1,0],[-Number.MAX_VALUE,0],[DURATION,previous(DURATION)],[DURATION+1,previous(DURATION)],[Number.MAX_VALUE,previous(DURATION)]]){
  drawFrame(canvas,time);const actual=JSON.stringify(calls);
  assert.equal(calls.find(call=>call[0]==='time')[1],want);
  drawFrame(canvas,want);assert.equal(JSON.stringify(calls),actual);
 }
 for(const time of [NaN,Infinity,-Infinity,undefined,null,'1',true,{}]){
  calls.length=0;
  assert.throws(()=>drawFrame(canvas,time),/Frame time must be a finite number/);
  assert.deepEqual(calls,[]);
 }
`));

test('exclusive-end helper accepts only finite positive numbers and returns their immediate predecessor',()=>{
 for(const end of [Number.MIN_VALUE,.02,1,174.1,Number.MAX_VALUE]){
  const before=beforeEnd(end);
  assert(before>=0&&before<end);
  const bits=new DataView(new ArrayBuffer(8));bits.setFloat64(0,before);bits.setBigUint64(0,bits.getBigUint64(0)+1n);
  assert.equal(bits.getFloat64(0),end);
 }
 for(const end of [0,-0,-1,NaN,Infinity,-Infinity,undefined,null,'1',true,{}])assert.throws(()=>beforeEnd(end),/finite and positive/);
});
