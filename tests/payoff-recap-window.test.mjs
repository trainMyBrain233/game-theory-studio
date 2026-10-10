import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {beyondMoneyState,recapState} from '../production/src/payoff-recap-timing.mjs';
import {ramp} from '../production/src/motion.mjs';
import {pythonCommand} from '../scripts/python.mjs';
const source=JSON.parse(fs.readFileSync(new URL('../chapters/01-four-elements/narration/timeline.json',import.meta.url)));
const retimeCode=`timeline.duration*=scale;
 for(const s of timeline.sections){s.start*=scale;s.end*=scale;}
 for(const s of timeline.segments){for(const f of ['start','end','voiceover_end','spoken_duration','pause_after','display_duration'])s[f]*=scale;for(const e of s.visual_cue.score_reveals??[])e.offset*=scale;}`;
function retime(scale){const timeline=structuredClone(source);eval(retimeCode);return timeline;}
const get=(timeline,id)=>timeline.segments.find(s=>s.id===id);
const state=(t,timeline)=>({b:beyondMoneyState(t,timeline),r:recapState(t,timeline)});
for(const scale of [1,.3,1.3,1e-8])test(`${scale}x: examples and recap settle before their next narration window`,()=>{
 const timeline=retime(scale);
 for(const id of ['s33_beyond_money','s34_intro','s35_first_pair','s36_second_pair']){
  const s=get(timeline,id),w=s.end-s.start;
  const times=[-.001,0,.25,.5,.75,.87,.9,.999,1,1.001].map(p=>s.start+w*p),snapshots=times.map(t=>state(t,timeline));
  for(const snapshot of snapshots)assert(!JSON.stringify(snapshot).includes('null'));
  for(const i of [9,0,4,3,1,8,5,5,6,2,7])assert.deepEqual(state(times[i],timeline),snapshots[i]);
  const v=state(s.start+w*.87,timeline);
  if(id==='s33_beyond_money'){assert.equal(v.b.alpha,1);assert.deepEqual(v.b.examples,[1,1,1]);}
  if(id==='s34_intro'){assert.equal(v.r.move,1);assert.equal(v.r.rows,1);}
  if(id==='s35_first_pair')assert.deepEqual(v.r.active,[1,1,0,0]);
  if(id==='s36_second_pair')assert.deepEqual(v.r.active,[1,1,1,1]);
 }
});
test('accepted 0.3x input reproduces the old late examples and second highlights',()=>{
 const timeline=retime(.3),s=get(timeline,'s33_beyond_money'),t=s.start+(s.end-s.start)*.87;
 assert.equal(ramp(t,s.start+1.1+2*1.15,.4),0);
 assert.deepEqual(beyondMoneyState(t,timeline).examples,[1,1,1]);
 for(const id of ['s35_first_pair','s36_second_pair']){
  const p=get(timeline,id),at=p.start+(p.end-p.start)*.87;
  assert.equal(ramp(at,p.start+1.4,.45),0);
  assert.equal(recapState(at,timeline).active[id==='s35_first_pair'?1:3],1);
 }
 const p=get(timeline,'s34_intro');
 assert(ramp(p.end,p.start+1.1,.55)<1);
 assert.equal(recapState(p.end,timeline).rows,1);
});
test('roomy default and 1.3x preserve historical arithmetic exactly',()=>{
 for(const scale of [1,1.3]){
  const timeline=retime(scale),s=get(timeline,'s33_beyond_money'),intro=get(timeline,'s34_intro');
  for(let i=0;i<=1500;i++){
   const t=s.start-1+(timeline.duration-s.start+2)*i/1500,{b,r}=state(t,timeline);
   assert.deepEqual(b,{entrance:ramp(t,s.start,.6),alpha:ramp(t,s.start,.6)*(1-ramp(t,s.end-.3,.25)),examples:[0,1,2].map(i=>ramp(t,s.start+1.1+i*1.15,.4))});
   assert.deepEqual(r,{move:ramp(t,intro.start,1.15),rows:ramp(t,intro.start+1.1,.55),active:[0,1,2,3].map(i=>ramp(t,i<2?get(timeline,'s35_first_pair').start+i*1.4:get(timeline,'s36_second_pair').start+(i-2)*1.4,.45))});
  }
 }
});
test('compression thresholds, tiny and zero synthetic widths remain finite',()=>{
 for(const [id,budget] of [['s33_beyond_money',4.5],['s34_intro',1.95],['s35_first_pair',2.2],['s36_second_pair',2.2]]){
  const s=get(source,id);
  for(const f of [0,.25,.5,.75,.9,1]){
   const values=[-1e-7,0,1e-7].map(delta=>{const timeline=retime((budget+delta)/(s.end-s.start)),p=get(timeline,id);return state(p.start+(p.end-p.start)*f,timeline);});
   const numbers=v=>Object.values(v).flatMap(x=>typeof x==='object'?numbers(x):[x]);
   const arrays=values.map(numbers);for(let i=0;i<arrays[0].length;i++)assert(Math.max(...arrays.map(a=>a[i]))-Math.min(...arrays.map(a=>a[i]))<1e-5,id);
  }
 }
 for(const width of [2**-45,0]){
  const timeline=structuredClone(source);for(const [i,s] of timeline.segments.entries()){s.start=128+i;s.end=s.start+width;}
  for(const s of timeline.segments)for(const t of [s.start-1,s.start,s.end,s.end+1])assert(!JSON.stringify(state(t,timeline)).includes('null'));
 }
});
for(const scale of [1,.3,1.3,1e-8])test(`${scale}x actual scene consumer: parent alpha and highlights within owning segments`,()=>{
 const url=p=>JSON.stringify(new URL(p,import.meta.url).href);
 const result=spawnSync(process.execPath,['--loader',new URL('./fixtures/tail-frame-recording-loader.mjs',import.meta.url).pathname,'--input-type=module','-e',`
 import assert from 'node:assert/strict';
 import {timeline,sceneData} from ${url('../production/src/model.mjs')};
 import {validateFirstEpisodeTimeline} from ${url('../scripts/validate-data.mjs')};
 import {calls,prepareAssets} from ${url('../production/src/primitives.mjs')};
 const scale=${scale};${retimeCode}validateFirstEpisodeTimeline(timeline,sceneData);
 await prepareAssets();const {drawFrame}=await import(${url('../production/src/scenes.mjs')});
 const context={save(){},restore(){},setTransform(){},fillRect(){}};
 const canvas={width:1920,height:1080,getContext(){return context;}};
 const render=t=>{drawFrame(canvas,t);return structuredClone(calls);};
 const ids=['s33_beyond_money','s34_intro','s35_first_pair','s36_second_pair'];
 for(const [n,id] of ids.entries()){
  const s=timeline.segments.find(s=>s.id===id),w=s.end-s.start;
  const snapshot=render(s.start+w*.87);
  const text=label=>snapshot.find(c=>c[0]==='text'&&c[1]===label&&c[4]===1);
  assert(snapshot.some(c=>c[0]==='text'&&c[1]===s.lines[0]&&c[4]>0),'Owning subtitle remains visible');
  if(n===0)for(const label of ['收益可以表示','省下的时间','声誉','对结果的偏好'])assert(text(label),label);
  else {
   for(const label of ['参与者','信息','策略','收益','谁来决定？','知道什么？','怎么选择？','各得什么？'])assert(text(label),label);
   for(let i=0;i<(n===1?0:n===2?2:4);i++)assert(snapshot.some(c=>c[0]==='line'&&c[1]===86&&c[2]===419+i*103&&c.at(-1)===1),'Actual recap highlight '+i);
  }
  const times=[-.001,0,.25,.5,.75,.87,.999,1,1.001].map(p=>s.start+w*p),snapshots=times.map(render);
  for(const i of [8,4,0,2,5,5,7,1,6,3])assert.deepEqual(render(times[i]),snapshots[i]);
 }
 `],{encoding:'utf8',env:{...process.env,PYTHON:pythonCommand()}});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
