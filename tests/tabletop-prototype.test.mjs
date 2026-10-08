import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCanvas} from '@napi-rs/canvas';
import {tabletopState,interactionSchedule,VARIANTS,TABLE} from '../design/experiments/tabletop/layout.mjs';
import {registeredWristTarget,solveRegisteredContact,handSlotTransforms} from '../design/experiments/tabletop/hand-interface.mjs';
import {presentationModel} from '../design/experiments/tabletop/presentation.mjs';
import {headAlphaBounds,avatarPlacement,drawAvatar} from '../design/experiments/tabletop/avatar.mjs';
const read=file=>JSON.parse(fs.readFileSync(new URL(file,import.meta.url),'utf8'));
const scene=read('../design/scenes.json'),timeline=read('../chapters/01-four-elements/narration/timeline.json'),presentation=read('../design/experiments/tabletop/presentation.json');
const context={scene,timeline},schedule=interactionSchedule(timeline);
const idle=Math.max(0,schedule.idleEnd-1),grasp=schedule.reachEnd+.85,place=(schedule.placeStart+schedule.contact)/2,release=(schedule.releaseStart+schedule.releaseEnd)/2;

test('planned interaction has a supported contact interval before release',()=>{
 const s=interactionSchedule(timeline);
 assert.ok(s.idleEnd<s.reachEnd&&s.reachEnd<s.placeStart&&s.placeStart<s.contact&&s.contact<s.releaseStart&&s.releaseStart<s.releaseEnd);
 for(const [time,phase] of [[idle,'idle'],[(s.idleEnd+s.reachEnd)/2,'reach'],[grasp,'grasp'],[place,'place'],[(s.contact+s.releaseStart)/2,'place'],[release,'release']])assert.equal(tabletopState('shared-rail',time,context).phase,phase);
 const state=tabletopState('shared-rail',(s.contact+s.releaseStart)/2,context);
 assert.equal(state.raised,0,'Card must reach support before planned release.');
});
test('resting support and owner survive all four choices in all three variants',()=>{
 for(const variant of VARIANTS)for(let row=0;row<2;row++)for(let column=0;column<2;column++){
  const input=structuredClone(scene);input.selected={row,column,actorA:input.strategies[row].id,actorB:input.strategies[column].id};
  for(const time of [idle,release]){
   const state=tabletopState(variant.id,time,{scene:input,timeline});
   for(const card of state.cards.filter(c=>c.alpha>.01)){
    assert.equal(card.bottom,card.supportY);assert.ok(card.bottom<=TABLE.frontY&&card.bottom-card.visibleHeight>=TABLE.backY);
    assert.equal(card.label,input.strategies.find(s=>s.id===card.kind).label);
    assert.equal(card.wristTarget,null);assert.equal(card.handPoseStatus,'unregistered');
   }
   assert.equal(state.cards.find(c=>c.actor==='A'&&c.chosen).kind,input.strategies[row].id);
   assert.equal(state.cards.find(c=>c.actor==='B'&&c.chosen).kind,input.strategies[column].id);
   if(time===release)assert.equal(state.cards.filter(c=>c.alpha>.01).length,2);
  }
 }
});
test('proposed grip corner is nearest each actor and never asserts linked hand art',()=>{
 const state=tabletopState('shared-rail',grasp,context);
 for(const card of state.cards.filter(c=>c.chosen)){
  assert.ok(card.actor==='A'?card.proposedCardContact[0]<card.x:card.proposedCardContact[0]>card.x);
  assert.ok(card.proposedCardContact[1]>=card.y-card.height/2&&card.proposedCardContact[1]<card.y);
 }
 assert.equal(state.rigEnd,'wrist');assert.equal(state.handArtLinked,false);
 assert.throws(()=>tabletopState('invented',27,context),/Unknown/);
 assert.throws(()=>tabletopState('shared-rail',Infinity,context),/Invalid/);
});
test('fading unselected flat cards keep their supported pose throughout pickup',()=>{
 for(const time of [0,.25,.5,.75,1].map(f=>schedule.reachEnd+.7*f)){
  const state=tabletopState('flat-rest',time,context);
  for(const card of state.cards.filter(c=>!c.chosen)){
   assert.equal(card.flat,1);assert.equal(card.visibleHeight,98*190/140*.28);assert.equal(card.bottom,846);
  }
 }
 const state=tabletopState('flat-rest',schedule.reachEnd+.35,context);assert.ok(state.cards.some(c=>!c.chosen&&c.alpha>.1&&c.alpha<.9));
 assert.ok(state.cards.some(c=>c.chosen&&c.flat<1),'Chosen card actually rotates while the other stays flat.');
});
test('pose crop translation preserves wrist target; mirror and rotation use registered offset',()=>{
 const pose={registered:true,wrist:[30,40],contact:[50,60]},cropped={registered:true,wrist:[5,10],contact:[25,30]};
 assert.deepEqual(registeredWristTarget([100,200],pose),[80,180]);
 assert.deepEqual(registeredWristTarget([100,200],cropped),[80,180]);
 const target=registeredWristTarget([100,200],pose,{side:-1,scale:2,rotation:Math.PI/2});
 assert.ok(Math.abs(target[0]-140)<1e-10&&Math.abs(target[1]-240)<1e-10);
 assert.notDeepEqual(registeredWristTarget([100,200],pose),[100,200],'Fingertip/contact cannot be treated as forearm endpoint.');
});
test('unregistered anchor or clamped IK cannot pass a contact claim',()=>{
 const pose={registered:true,wrist:[10,10],contact:[25,30]};
 assert.throws(()=>registeredWristTarget([100,200],{...pose,registered:false}),/HAND_ANCHOR_REQUIRED/);
 assert.throws(()=>registeredWristTarget([100,200],{...pose,wrist:null}),/HAND_ANCHOR_REQUIRED/);
 assert.throws(()=>registeredWristTarget([100,200],pose,{scale:0}),/Invalid/);
 assert.throws(()=>solveRegisteredContact([100,200],pose,{},wrist=>({wrist,clamped:true})),/UNREACHABLE_WRIST/);
 assert.throws(()=>solveRegisteredContact([100,200],pose,{},()=>({wrist:[100,200],clamped:false})),/UNREACHABLE_WRIST/);
 const solved=solveRegisteredContact([100,200],pose,{},wrist=>({wrist,clamped:false}));
 assert.deepEqual(solved.wrist,[85,180]);assert.deepEqual(solved.layerOrder,['forearm','rear-palm-thumb','card','front-fingers']);
});
test('rear/front crop slots share a stable world wrist independently of drawing order',()=>{
 const pose={registered:true,wrist:[30,40],contact:[50,60],layers:{'front-fingers':{wrist:[5,10]},'rear-palm-thumb':{wrist:[30,40]}}};
 const world=[480,760],result=handSlotTransforms(world,pose,{scale:.7,side:-1,rotation:.4});
 for(const slot of Object.values(result.slots)){
  const [a,b,c,d,e,f]=slot.matrix,[x,y]=slot.localWrist;
  assert.ok(Math.abs(a*x+c*y+e-world[0])<1e-10&&Math.abs(b*x+d*y+f-world[1])<1e-10);
 }
 assert.deepEqual(result.drawOrder,['forearm','rear-palm-thumb','card','front-fingers']);
 const changed=structuredClone(pose);changed.contact=[70,30];changed.layers['front-fingers'].wrist=[80,6];
 const next=handSlotTransforms(world,changed,{scale:.7,side:-1,rotation:.4});
 assert.deepEqual(next.worldWrist,result.worldWrist,'Changing pose/contact never changes the forearm endpoint.');
 assert.notDeepEqual(next.gripPoint,result.gripPoint,'Independent pose grip can change around the same wrist.');
 assert.throws(()=>handSlotTransforms(world,{...pose,layers:{}}),/crop wrist/);
});
test('names/header remain configurable while row, column and payoff order remain stable',()=>{
 const old=JSON.stringify(scene),model=presentationModel(presentation,scene);
 assert.equal(model.actors.A.name,'普通僵尸');assert.equal(model.actors.B.name,'路障僵尸');
 assert.equal(model.narrationNames.A,model.scene.actors.find(a=>a.id==='A').label);
 assert.deepEqual(model.matrix,{rowActor:'A',columnActor:'B',scoreOrder:['A','B'],values:scene.payoffs});
 assert.equal(model.status,'draft');assert.equal(model.timingRevision,'pending-new-script');assert.equal(JSON.stringify(scene),old);
 const changed=structuredClone(presentation);changed.series='测试王国';changed.episode={number:'03',title:'配置接口'};changed.actors.A.name='明月';changed.actors.B.name='青禾';
 const replacement=presentationModel(changed,scene);assert.equal(replacement.header,'测试王国｜第03集·配置接口');assert.equal(replacement.narrationNames.B,'青禾');
 assert.deepEqual(replacement.matrix.values,scene.payoffs);
});
test('draft identity rejects swapped portrait ownership and misleading accepted content',()=>{
 for(const mutation of [c=>{c.actors.A.avatar.actor='B'},c=>{c.actors.B.name=c.actors.A.name},c=>{c.status='accepted'},c=>{c.actors.B.avatar.layer='new-face'},c=>{c.episode.number='1'}]){
  const changed=structuredClone(presentation);mutation(changed);assert.throws(()=>presentationModel(changed,scene));
 }
});
test('actual alpha fitting retains the full original tall head/hat and common baseline',()=>{
 const tall=createCanvas(160,260),a=tall.getContext('2d');a.fillStyle='#BC3D31';a.fillRect(50,12,60,18);a.fillStyle='#243E66';a.fillRect(35,30,90,210);
 const regular=createCanvas(160,260),b=regular.getContext('2d');b.fillRect(45,90,70,150);
 const tallBounds=headAlphaBounds(tall),regularBounds=headAlphaBounds(regular);
 assert.deepEqual(tallBounds,{x:35,y:12,width:90,height:228});
 const box={x:12,y:15,size:80,padding:6},p=avatarPlacement(tallBounds,box),q=avatarPlacement(regularBounds,box);
 assert.ok(p.y>=box.y+box.padding&&p.x>=box.x+box.padding);
 assert.ok(Math.abs(p.y+p.height-(q.y+q.height))<1e-10,'Actual alpha bottoms share a baseline.');
 const target=createCanvas(110,110),c=target.getContext('2d');drawAvatar(c,{actor:'B',image:tall,bounds:tallBounds},'B',box);
 const pixels=c.getImageData(0,0,110,110).data;
 assert.ok(Array.from({length:110*110},(_,i)=>i*4).some(i=>pixels[i]>150&&pixels[i+1]<100&&pixels[i+3]>150),'Top hat pixels survived actual drawing.');
 const outputBounds=headAlphaBounds(target);assert.ok(outputBounds.y>=box.y+5&&outputBounds.y+outputBounds.height<=box.y+box.size-box.padding+1);
 assert.throws(()=>drawAvatar(c,{actor:'B',image:tall,bounds:tallBounds},'A',box),/owner/);
 assert.throws(()=>headAlphaBounds(createCanvas(10,10)),/Empty/);
});
