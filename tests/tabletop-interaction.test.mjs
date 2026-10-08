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
function assertBoundaryVelocity(stateAt){
 const h=1e-4,boundaries=[...Object.values(DEMO.events),DEMO.events.grab+1.3];
 for(const time of boundaries){
  const before=stateAt(time-h),at=stateAt(time),after=stateAt(time+h);
  const points=state=>[...state.cards.map(card=>[card.x,card.y]),...state.arms.flatMap(arm=>[arm.wrist,arm.elbow])];
  const a=points(before),b=points(at),c=points(after);
  for(let i=0;i<b.length;i++)for(let axis=0;axis<2;axis++){
   const left=(b[i][axis]-a[i][axis])/h,right=(c[i][axis]-b[i][axis])/h;
   assert.ok(Math.abs(right-left)<.01,`Velocity jump at ${time}s, point ${i}, axis ${axis}: ${left} -> ${right} px/s`);
  }
 }
}
test('hands and cards preserve velocity across approach, lift, support and retreat boundaries',()=>{
 for(let row=0;row<2;row++)for(let column=0;column<2;column++){
  const input=structuredClone(scene);input.selected={row,column,actorA:input.strategies[row].id,actorB:input.strategies[column].id};
  assertBoundaryVelocity(t=>demoState(t,{...context,scene:input}));
 }
});
test('velocity regression rejects a linear lift even though position continuity still passes',async()=>{
 const file=new URL('../design/experiments/tabletop/interaction.mjs',import.meta.url),source=fs.readFileSync(file,'utf8');
 assert.equal(source.split('const lift=70*smooth').length,2,'Mutation must target the real lift implementation once.');
 const mutated=source.replace('const lift=70*smooth','const lift=70*clamp').replace("'./hand-interface.mjs'",JSON.stringify(new URL('./hand-interface.mjs',file).href));
 const {demoState:linear}=await import(`data:text/javascript;base64,${Buffer.from(mutated).toString('base64')}`);
 const time=DEMO.events.grab,before=linear(time-1e-6,context),after=linear(time+1e-6,context);
 assert.ok(Math.hypot(...after.arms[0].wrist.map((v,i)=>v-before.arms[0].wrist[i]))<.001,'Old position check alone accepts the broken easing.');
 assert.throws(()=>assertBoundaryVelocity(t=>linear(t,context)),/Velocity jump at 2\.65s/);
});
function assertControlSequence(stateAt){
 const h=1e-6,initial=stateAt(0).cards,ids=initial.map(card=>card.id);
 assert.equal(new Set(ids).size,4);
 for(const time of [0,...Object.values(DEMO.events),DEMO.events.grab-h,DEMO.events.grab+h,DEMO.events.release-h,DEMO.events.release+h,10]){
  const state=stateAt(time);assert.deepEqual(state.cards.map(card=>card.id),ids,'Card identity survives the whole cycle.');
  for(const card of state.cards){
   assert.equal(card.id,`${card.actor}:${card.kind}`);
   const expected=card.chosen&&time>=DEMO.events.grab&&time<DEMO.events.release?'hand':'table';
   assert.equal(card.controller,expected,`Ownership at ${time}s for ${card.id}`);
  }
 }
 for(const time of [DEMO.events.grab,DEMO.events.release]){
  const before=stateAt(time-h).cards,at=stateAt(time).cards,after=stateAt(time+h).cards;
  for(let i=0;i<4;i++){
   assert.ok(Math.hypot(before[i].x-at[i].x,before[i].y-at[i].y)<.001);
   assert.ok(Math.hypot(after[i].x-at[i].x,after[i].y-at[i].y)<.001);
   assert.equal(before[i].width,after[i].width);
   if(time===DEMO.events.release)assert.equal(at[i].bottom,906,'Table takeover has explicit support.');
  }
 }
}
test('stable cards have table to hand to table ownership with an unchanged handoff pose',()=>{
 for(let row=0;row<2;row++)for(let column=0;column<2;column++){
  const input=structuredClone(scene);input.selected={row,column,actorA:input.strategies[row].id,actorB:input.strategies[column].id};
  assertControlSequence(t=>demoState(t,{...context,scene:input}));
 }
});
test('ownership regression rejects selected cards labelled hand throughout the cycle',async()=>{
 const file=new URL('../design/experiments/tabletop/interaction.mjs',import.meta.url),source=fs.readFileSync(file,'utf8'),target="controller:chosen&&t>=e.grab&&t<e.release?'hand':'table'";
 assert.equal(source.split(target).length,2,'Mutation must change the actual scheduled controller once.');
 const mutated=source.replace(target,"controller:chosen?'hand':'table'").replace("'./hand-interface.mjs'",JSON.stringify(new URL('./hand-interface.mjs',file).href));
 const {demoState:alwaysHand}=await import(`data:text/javascript;base64,${Buffer.from(mutated).toString('base64')}`);
 assert.throws(()=>assertControlSequence(t=>alwaysHand(t,context)),/Ownership at 0s/);
});
