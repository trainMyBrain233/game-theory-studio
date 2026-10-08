import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DEMO,demoState} from '../design/experiments/tabletop/interaction.mjs';
import {CAMERA} from '../design/experiments/tabletop/layout.mjs';
const scene=JSON.parse(fs.readFileSync(new URL('../design/scenes.json',import.meta.url),'utf8')),context={scene,camera:CAMERA};
test('geometric cycle has explicit contact, supported handoff and retreat for all four choices',()=>{
 for(let row=0;row<2;row++)for(let column=0;column<2;column++){
  const input=structuredClone(scene);input.selected={row,column,actorA:input.strategies[row].id,actorB:input.strategies[column].id};const ctx={...context,scene:input};
  for(let frame=0;frame<=300;frame++){
   const state=demoState(frame/30,ctx);
   for(const item of state.cards){if(!item.chosen)assert.equal(item.bottom,906);if(item.controller==='table')assert.equal(item.bottom,906);}
   for(const arm of state.arms){
    assert.ok(Math.abs(Math.hypot(arm.elbow[0]-arm.shoulder[0],arm.elbow[1]-arm.shoulder[1])-150)<1e-9);
    assert.ok(Math.abs(Math.hypot(arm.wrist[0]-arm.elbow[0],arm.wrist[1]-arm.elbow[1])-150)<1e-9);
    if(arm.handBound){assert.equal(arm.wrist[0]+arm.side*18,arm.grip[0]);assert.equal(arm.wrist[1],arm.grip[1]);}
   }
  }
  assert.equal(demoState(DEMO.events.contact,ctx).lift,0);
  assert.equal(demoState(DEMO.events.grab,ctx).close,1);
  assert.equal(demoState(DEMO.events.supported,ctx).lift,0);
  assert.equal(demoState(DEMO.events.release,ctx).close,1);
  assert.equal(demoState(DEMO.events.retreat,ctx).close,0);
  assert.deepEqual(demoState(10,ctx).cards,demoState(0,ctx).cards);
 }
});
test('cycle state is time driven, continuous at handoffs and rejects unreachable targets',()=>{
 const expected=demoState(4,context);demoState(9,context);assert.deepEqual(demoState(4,context),expected);
 for(const time of Object.values(DEMO.events)){
  const before=demoState(time-1e-6,context),after=demoState(time+1e-6,context);
  for(let i=0;i<2;i++)assert.ok(Math.hypot(...after.arms[i].wrist.map((v,k)=>v-before.arms[i].wrist[k]))<.001);
 }
 const camera=structuredClone(CAMERA);camera.actors.A.x=-1000;
 assert.throws(()=>demoState(4,{scene,camera}),/UNREACHABLE_WRIST/);
 assert.throws(()=>demoState(NaN,context),/Invalid demo time/);
});
