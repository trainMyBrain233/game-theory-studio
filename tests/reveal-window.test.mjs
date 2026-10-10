import test from 'node:test';
import assert from 'node:assert/strict';
import {revealWithinWindow} from '../production/src/reveal-window.mjs';
import {textTransitionState} from '../production/src/motion.mjs';
const state=(t,start,end,d)=>revealWithinWindow((_c,time,at,_fn,options)=>textTransitionState(time,at,options),null,t,start,end,()=>{},{d,dy:6});
for(const d of [.38,.55])test(`${d}s entrance preserves roomy arithmetic and settles compressed/degenerate windows`,()=>{
 for(const start of [0,115.4])for(const width of [d+1e-8,d+1,3.4])for(const f of [-.001,0,.25,.5,.75,1,1.001,2]){
  const t=start+d*f;assert.deepEqual(state(t,start,start+width,d),textTransitionState(t,start,{d,dy:6}));
 }
 for(const start of [0,115.4])for(const width of [.126,1e-8,2**-45,0]){
  const end=start+width;
  assert.equal(state(start-1e-5,start,end,d).alpha,0);
  assert.equal(state(end,start,end,d).alpha,1);
  assert.equal(state(end,start,end,d).dy,0);
  assert.equal(state(end+1e-5,start,end,d).alpha,1);
  if(end>start){assert.equal(state(start,start,end,d).alpha,0);assert(Number.isFinite(state(start+(end-start)*.5,start,end,d).alpha));}
 }
});

test('focused-score parent entrance and exit keep their own bounds and historical roomy arithmetic',async()=>{
 const {windowProgress}=await import('../production/src/reveal-window.mjs');
 const {ramp}=await import('../production/src/motion.mjs');
 for(const d of [.5,.25]){
  for(const t of [99,100,100.1,100.25,100.5,101])assert.equal(windowProgress(ramp,t,100,101,d),ramp(t,100,d));
  for(const width of [.01,1e-8,0]){
   const start=100,end=start+width;
   assert.equal(windowProgress(ramp,start-1,start,end,d),0);
   assert.equal(windowProgress(ramp,end,start,end,d),1);
   assert.equal(windowProgress(ramp,end+1,start,end,d),1);
  }
 }
});

test('0.07x s25 reproduces the old unfinished owner and focused pair',()=>{
 const start=115.4*.07,end=118.8*.07,lastEvent=start+1.8*.07;
 const old=textTransitionState(end,lastEvent,{d:.38,dy:6});
 assert(old.alpha>0&&old.alpha<.2,'Old fixed .38s owner reveal is still faint at the owning end.');
 assert.equal(state(end,lastEvent,end,.38).alpha,1);
 assert.equal(state(end,lastEvent,end,.55).alpha,1);
});
