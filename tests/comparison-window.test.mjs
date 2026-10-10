import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {comparisonState} from '../production/src/comparison-timing.mjs';
import {ramp} from '../production/src/motion.mjs';
import {validateFirstEpisodeTimeline} from '../scripts/validate-data.mjs';
const source=JSON.parse(fs.readFileSync(new URL('../chapters/01-four-elements/narration/timeline.json',import.meta.url)));
const scenes=JSON.parse(fs.readFileSync(new URL('../design/scenes.json',import.meta.url)));
function retime(scale) {
 const timeline=structuredClone(source);timeline.duration*=scale;
 for(const section of timeline.sections){section.start*=scale;section.end*=scale;}
 for(const segment of timeline.segments){
  for(const field of ['start','end','voiceover_end','spoken_duration','pause_after','display_duration'])segment[field]*=scale;
  for(const event of segment.visual_cue.score_reveals??[])event.offset*=scale;
 }
 validateFirstEpisodeTimeline(timeline,scenes);return timeline;
}
const get=(timeline,id)=>timeline.segments.find(s=>s.id===id);
function legacy(t,timeline) {
 const a=get(timeline,'s16_comparison_intro').start,b=get(timeline,'s17_comparison_example').start,c=get(timeline,'s18_return_single_round');
 return {
  multi:ramp(t,a,1.05),comparisonAlpha:ramp(t,a+1.05,.4)*(1-ramp(t,c.start+2.05,.35)),hidden:ramp(t,a,.55)*(1-ramp(t,b,.6)),
  first:ramp(t,b,.55),plan:ramp(t,b+1.55,.7),red:ramp(t,b+2.2,.55),blue:ramp(t,b+3,.55),
  back:ramp(t,c.start+2.5,1.1),names:ramp(t,c.start+3.55,.25),single:ramp(t,c.start+3.4,.4),singleExit:ramp(t,c.end-.3,.25),
 };
}
test('reproduces old late branches on the accepted 0.3x timeline',()=>{
 const timeline=retime(.3),s=get(timeline,'s17_comparison_example'),next=get(timeline,'s18_return_single_round');
 assert(Math.abs(s.end-s.start-1.77)<1e-12);
 assert.equal(legacy(next.start,timeline).red,0);assert.equal(legacy(next.start,timeline).blue,0);
 assert(legacy(next.start+1.6,timeline).blue>0,'The old blue branch appears under the return subtitle');
 const fixed=comparisonState(next.start,timeline);
 for(const name of ['first','plan','red','blue'])assert.equal(fixed[name],1,`${name} must finish before the return subtitle`);
});
for(const scale of [1,1.3,.3,1e-8])test(`comparison insert fits ${scale}x timeline and is order-independent`,()=>{
 const timeline=retime(scale);
 for(const [id,fields] of [
  ['s16_comparison_intro',['multi','comparisonAlpha','hidden']],
  ['s17_comparison_example',['first','plan','red','blue']],
  ['s18_return_single_round',['back','names','single']],
 ]) {
  const s=get(timeline,id),w=s.end-s.start;
  const times=[s.start-w*.001,s.start,...[.25,.5,.75,.8,.9,.999].map(p=>s.start+w*p),s.end,s.end+w*.001];
  const states=times.map(t=>comparisonState(t,timeline));
  for(const state of states)for(const value of Object.values(state))assert(Number.isFinite(value)&&value>=0&&value<=1);
  for(const i of [8,2,5,0,9,4,4,3,1,7,6])assert.deepEqual(comparisonState(times[i],timeline),states[i]);
  const held=comparisonState(s.start+w*.9,timeline);
  for(const field of fields)assert.equal(held[field],1,`${id}: ${field} must settle inside its own window`);
  if(id==='s17_comparison_example') {
   assert.equal(comparisonState(s.start,timeline).blue,0);
   assert.equal(held.hidden,0);assert.equal(held.comparisonAlpha,1);
   assert.equal(comparisonState(s.end,timeline).blue,1);
  }
  if(id==='s18_return_single_round') {
   assert.equal(held.comparisonAlpha,0);assert.equal(held.singleExit,0,'Returned label gets a settled reading hold');
   assert.equal(comparisonState(s.end,timeline).singleExit,1);
  }
 }
});
test('default and extended windows retain historical phase arithmetic exactly',()=>{
 for(const scale of [1,1.3]){
  const timeline=retime(scale),start=get(timeline,'s16_comparison_intro').start,end=get(timeline,'s18_return_single_round').end;
  for(let i=0;i<=1200;i++){
   const t=start-1+(end-start+2)*i/1200;
   assert.deepEqual(comparisonState(t,timeline),legacy(t,timeline),`scale ${scale}, time ${t}`);
  }
 }
});
test('one-ULP and zero-width windows never divide by zero or return NaN',()=>{
 for(const width of [2**-45,0]) {
  const timeline={segments:['s16_comparison_intro','s17_comparison_example','s18_return_single_round'].map((id,i)=>({id,start:128+i,end:128+i+width}))};
  for(const s of timeline.segments)for(const time of [s.start-1,s.start,s.end,s.end+1]) {
   const state=comparisonState(time,timeline);assert(Object.values(state).every(Number.isFinite));
  }
 }
});
test('real scene consumer shows both branch labels before s18 on a legal 0.3x retime',()=>{
 const url=relative=>JSON.stringify(new URL(relative,import.meta.url).href);
 const result=spawnSync(process.execPath,['--loader',new URL('./fixtures/tail-frame-recording-loader.mjs',import.meta.url).pathname,'--input-type=module','-e',`
  import assert from 'node:assert/strict';
  import {timeline,sceneData} from ${url('../production/src/model.mjs')};
  import {validateFirstEpisodeTimeline} from ${url('../scripts/validate-data.mjs')};
  import {calls,prepareAssets} from ${url('../production/src/primitives.mjs')};
  const scale=.3;timeline.duration*=scale;
  for(const section of timeline.sections){section.start*=scale;section.end*=scale;}
  for(const segment of timeline.segments){
   for(const field of ['start','end','voiceover_end','spoken_duration','pause_after','display_duration'])segment[field]*=scale;
   for(const event of segment.visual_cue.score_reveals??[])event.offset*=scale;
  }
  validateFirstEpisodeTimeline(timeline,sceneData);await prepareAssets();
  const {drawFrame}=await import(${url('../production/src/scenes.mjs')});
  const s=timeline.segments.find(s=>s.id==='s17_comparison_example');
  const context={save(){},restore(){},setTransform(){},fillRect(){}};
  const canvas={width:1920,height:1080,getContext(){return context;}};
  const labels=['对方选{{red}}','自己选{{red}}','对方选{{blue}}','自己选{{blue}}'];
  drawFrame(canvas,s.start+(s.end-s.start)*.9);
  for(const label of labels)assert.equal(calls.find(c=>c[0]==='text'&&c[1]===label)?.[4],1,label);
  assert(calls.some(c=>c[0]==='text'&&c[1]===s.lines[0]&&c[4]>0),'The example subtitle must still be active');
  const next=timeline.segments.find(s=>s.id==='s18_return_single_round');
  drawFrame(canvas,next.start+(next.end-next.start)*.8);
  for(const label of labels)assert.equal(calls.find(c=>c[0]==='text'&&c[1]===label)?.[4]??0,0);
  assert.equal(calls.find(c=>c[0]==='text'&&c[1]==='仍然只玩一轮')?.[4],1);
 `],{encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});

test('compression thresholds preserve continuity and settle all required phases',()=>{
 for(const [id,budget,field] of [['s16_comparison_intro',1.65,'multi'],['s17_comparison_example',4,'blue'],['s18_return_single_round',4.8,'single']]) {
  const original=get(source,id),baseWindow=original.end-original.start;
  const around=[budget-1e-7,budget,budget+1e-7].map(window=>retime(window/baseWindow));
  for(const fraction of [0,.25,.5,.75,.9,1]) {
   const values=around.map(timeline=>{const s=get(timeline,id);return comparisonState(s.start+(s.end-s.start)*fraction,timeline)[field];});
   assert(Math.max(...values)-Math.min(...values)<1e-5,`${id}: compression must be continuous at ${budget}s`);
   if(fraction===.9)assert(values.every(value=>value===1));
  }
 }
});
