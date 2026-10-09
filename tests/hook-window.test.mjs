import test from 'node:test';
import assert from 'node:assert/strict';
import {hookState,hookBudget,hookPhases} from '../production/src/hook-timing.mjs';
import {ramp} from '../production/src/motion.mjs';
import {timeline} from '../production/src/model.mjs';
import {createLayoutSamples} from '../production/qa/layout-samples.mjs';
function legacy(t,s){return {actors:ramp(t,.4,.75),names:t>1.6,reveal:ramp(t,1.4,.55),arrowA:ramp(t,2,.7),arrowB:ramp(t,2.35,.7),exit:ramp(t,s.end-.32,.27),alpha:1-ramp(t,s.end-.32,.27),questionAlpha:ramp(t,1.4,.55)*(1-ramp(t,s.end-.32,.27))};}
for(const scale of [1,1.3,.3,1e-8])test(`${scale}x hook fits question and completed arrows together before clearing`,()=>{
 const segment={start:0,end:6.5*scale},hold=scale<1?segment.end*.875:3.1;
 const state=hookState(hold,segment);
 assert.equal(state.actors,1);assert.equal(state.names,true);assert.equal(state.questionAlpha,1);
 for(const key of ['arrowA','arrowB'])assert.equal(state[key]*state.questionAlpha,1,`fully drawn ${key} with opaque parent`);
 assert.equal(hookState(segment.end,segment).questionAlpha,0);
 for(const fraction of [0,.25,.5,.75,.875,.95,1]){
  const t=segment.end*fraction,a=hookState(t,segment);hookState(segment.end-t,segment);assert.deepEqual(hookState(t,segment),a);
 }
});
test('negative control reproduces both arrows never appearing in accepted 0.3x hook',()=>{
 const s={start:0,end:1.95};
 for(let i=0;i<=1000;i++){const old=legacy(s.end*i/1000,s);assert.equal(old.questionAlpha*old.arrowA,0);assert.equal(old.questionAlpha*old.arrowB,0);}
});
test('default and extended arithmetic remains exact',()=>{
 for(const end of [6.5,8.45])for(let i=0;i<=1000;i++){const t=end*i/1000;assert.deepEqual(hookState(t,{start:0,end}),legacy(t,{end}));}
});
test('compression threshold is continuous',()=>{
 for(const fraction of [.2,.45,.65,.875,.94,.99]){
  const states=[-1e-7,0,1e-7].map(d=>hookState((hookBudget+d)*fraction,{start:0,end:hookBudget+d}));
  for(const key of ['actors','reveal','arrowA','arrowB','alpha','questionAlpha'])assert(Math.max(...states.map(s=>s[key]))-Math.min(...states.map(s=>s[key]))<1e-5);
 }
});
test('tiny, zero and one-ULP clocks are finite and fit complete motion where representable',()=>{
 for(const width of [0,2**-45,1e-100])for(const start of [0,128])for(const t of [start,start+width*.875,start+width]){
  const state=hookState(t,{start,end:start+width});assert(Object.values(state).every(v=>typeof v==='boolean'||Number.isFinite(v)));
 }
 const s={start:128,end:128+1e-8},state=hookState(s.start+(s.end-s.start)*.875,s);
 assert.equal(state.questionAlpha*state.arrowB,1);
});
test('live QA samples cover each actual fitted phase at quarters and adjacent frames',()=>{
 for(const scale of [.3,1,1.3,1e-8]){
  const timing=structuredClone(timeline);timing.duration*=scale;
  for(const collection of [timing.segments,timing.sections])for(const s of collection){s.start*=scale;s.end*=scale;}
  for(const s of timing.segments)for(const r of s.visual_cue.score_reveals??[])r.offset*=scale;
  const {times,intervals}=createLayoutSamples(timing),s=timing.segments[0];
  const hook=intervals.filter(p=>p.id.startsWith('s01_hook:')&&!p.id.endsWith(':subtitle'));
  for(const [name,,duration] of hookPhases){
   const phase=hook.find(p=>p.id===`s01_hook:${name}`);assert(phase);assert(phase.end<=s.end);
   for(const f of [0,.25,.5,.75,1]){const t=phase.start+(phase.end-phase.start)*f;assert(times.includes(t));}
  }
  assert(hook.some(p=>p.id==='s01_hook:exit'));assert(!intervals.some(p=>p.id.startsWith('intro:arrow')));
  const hold=s.start+(s.end-s.start)*.875;
  if(scale<1)assert.equal(hookState(hold,s).questionAlpha*hookState(hold,s).arrowB,1);
 }
});
