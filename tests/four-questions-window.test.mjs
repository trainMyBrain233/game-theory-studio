import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fourQuestionsState} from '../production/src/four-questions-timing.mjs';
import {ramp} from '../production/src/motion.mjs';
import {validateFirstEpisodeTimeline} from '../scripts/validate-data.mjs';
const source=JSON.parse(fs.readFileSync(new URL('../chapters/01-four-elements/narration/timeline.json',import.meta.url)));
const scenes=JSON.parse(fs.readFileSync(new URL('../design/scenes.json',import.meta.url)));
function retime(scale){
 const timeline=structuredClone(source);timeline.duration*=scale;
 for(const s of timeline.sections){s.start*=scale;s.end*=scale;}
 for(const s of timeline.segments){
  for(const f of ['start','end','voiceover_end','spoken_duration','pause_after','display_duration'])s[f]*=scale;
  for(const e of s.visual_cue.score_reveals??[])e.offset*=scale;
 }
 validateFirstEpisodeTimeline(timeline,scenes);return timeline;
}
const cue=timeline=>timeline.segments.find(s=>s.id==='s02_four_questions');
function legacy(t,s){const enter=ramp(t,s.start,.6),exit=ramp(t,s.end-.3,.25);return {enter,exit,alpha:enter*(1-exit),items:[0,1,2,3].map(i=>ramp(t,s.start+.35*i,.4))};}
test('accepted 0.3x cue reproduces fourth-label truncation and gives all four a full-opacity hold',()=>{
 const s=cue(retime(.3));
 assert(legacy(s.end-.3,s).items[3]<1,'old fourth item has not settled when exit begins');
 assert(s.start+1.45>s.end,'old fourth item finishes after the scene switches');
 const state=fourQuestionsState(s.start+(s.end-s.start)*.8,s);
 assert.deepEqual(state.items,[1,1,1,1]);assert.equal(state.alpha,1);
});
for(const scale of [1,1.3,.3,1e-8])test(`${scale}x cue fits entrances, hold and exit deterministically`,()=>{
 const s=cue(retime(scale)),width=s.end-s.start;
 const times=[-.001,0,.25,.5,.725,.75,.8,.85,.9,.975,1,1.001].map(p=>s.start+width*p);
 const states=times.map(t=>fourQuestionsState(t,s));
 for(const state of states){
  for(const v of [state.enter,state.exit,state.alpha,...state.items])assert(Number.isFinite(v)&&v>=0&&v<=1);
  for(let i=1;i<4;i++)assert(state.items[i]<=state.items[i-1],'ordered stagger');
 }
 assert.deepEqual(states[6].items,[1,1,1,1]);assert.equal(states[6].alpha,1);
 assert.equal(states[1].alpha,0);assert.equal(states[10].alpha,0);
 for(const i of [10,4,2,7,0,11,3,3,9,1,8,5,6])assert.deepEqual(fourQuestionsState(times[i],s),states[i]);
});
test('default and extended windows retain exact historical phase arithmetic',()=>{
 for(const scale of [1,1.3]){const s=cue(retime(scale));for(let i=0;i<=1000;i++){const t=s.start-1+(s.end-s.start+2)*i/1000;assert.deepEqual(fourQuestionsState(t,s),legacy(t,s));}}
});
test('compression threshold is continuous and tiny/zero-width clocks stay finite',()=>{
 for(const fraction of [0,.25,.5,.75,.8,.9,1]){
  const states=[-1e-7,0,1e-7].map(delta=>{const s={start:6.5,end:8.5+delta};return fourQuestionsState(s.start+(s.end-s.start)*fraction,s);});
  for(const key of ['enter','exit','alpha'])assert(Math.max(...states.map(s=>s[key]))-Math.min(...states.map(s=>s[key]))<1e-5);
 }
 for(const width of [2**-45,0])for(const t of [127,128,128+width,129]){
  const s=fourQuestionsState(t,{start:128,end:128+width});assert([s.enter,s.exit,s.alpha,...s.items].every(Number.isFinite));
 }
});
test('actual scene consumer settles the fourth label during the 0.3x matching subtitle',()=>{
 const url=p=>JSON.stringify(new URL(p,import.meta.url).href);
 const result=spawnSync(process.execPath,['--loader',new URL('./fixtures/tail-frame-recording-loader.mjs',import.meta.url).pathname,'--input-type=module','-e',`
  import assert from 'node:assert/strict';
  import {timeline,sceneData} from ${url('../production/src/model.mjs')};
  import {validateFirstEpisodeTimeline} from ${url('../scripts/validate-data.mjs')};
  import {calls,prepareAssets} from ${url('../production/src/primitives.mjs')};
  timeline.duration*=.3;
  for(const s of timeline.sections){s.start*=.3;s.end*=.3;}
  for(const s of timeline.segments){for(const f of ['start','end','voiceover_end','spoken_duration','pause_after','display_duration'])s[f]*=.3;for(const e of s.visual_cue.score_reveals??[])e.offset*=.3;}
  validateFirstEpisodeTimeline(timeline,sceneData);await prepareAssets();
  const {drawFrame}=await import(${url('../production/src/scenes.mjs')});
  const c={save(){},restore(){},setTransform(){},fillRect(){}},canvas={width:1920,height:1080,getContext(){return c;}};
  const s=timeline.segments.find(s=>s.id==='s02_four_questions');
  drawFrame(canvas,s.start+(s.end-s.start)*.8);
  for(const text of ['参与者','信息','策略','收益'])assert.equal(calls.find(r=>r[0]==='text'&&r[1]===text)?.[4],1,text);
  assert(calls.some(r=>r[0]==='text'&&r[1]===s.lines[0]&&r[4]>0));
 `],{encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
