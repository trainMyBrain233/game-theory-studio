import test from 'node:test';
import assert from 'node:assert/strict';
import {cardTransform,cardAttachment} from '../production/src/card-transform.mjs';
import {informationChoreography} from '../production/src/choreography.mjs';
import {getRigPose} from '../production/src/rgba_character_rig.mjs';
import {actorPose} from '../production/src/character_adapter.mjs';

test('physical grip uses the card angle and stays fixed through its face flip',()=>{
 for(const side of [1,-1]){
  const base=cardAttachment(cardTransform({x:500,y:700,w:105,angle:.035,flip:1}),side);
  assert.deepEqual(base.local,[side*42,-52]);
  for(const flip of [1,.5,0,-.5,-1])assert.deepEqual(cardAttachment(cardTransform({x:500,y:700,w:105,angle:.035,flip}),side),base);
  assert.ok(Math.abs(base.world[0]-(500+side*42))>.1,'Angle must affect the attachment.');
 }
 assert.throws(()=>cardAttachment(cardTransform({x:0,y:0}),0));
});

test('all four selected cells preserve fixed bone lengths and reachable corner grips',()=>{
 const times=[27,36.5,37.2,38.2,42.6,43.6,44,44.8];
 for(const row of [0,1])for(const column of [0,1])for(const t0 of times)for(const delta of [-1/30,0,1/30]){
  const q=informationChoreography(t0+delta,{selected:{row,column,actorA:row?'blue':'red',actorB:column?'blue':'red'}});
  for(const [id,x,side] of [['A',260,1],['B',1284,-1]]){
   const ax=x+(id==='A'?80:340)*.84,ay=357+268*.84,scale=.6;
   const rest=[ax+250*scale*side,ay+296*scale],world=q.handTarget(id,rest);
   const p=getRigPose(id,13,{handOverride:[(world[0]-ax)/(scale*side),(world[1]-ay)/scale]});
   assert.ok(Math.abs(Math.hypot(p.elbow[0]-p.shoulder[0],p.elbow[1]-p.shoulder[1])-164)<1e-9);
   assert.ok(Math.abs(Math.hypot(p.hand[0]-p.elbow[0],p.hand[1]-p.elbow[1])-218)<1e-9);
   assert.equal(p.handClamped,false,`${row}${column} ${id} ${t0+delta}`);
   assert.ok(p.contactError*scale<2);
   if(q.grip>.999)assert.ok(Math.hypot(ax+p.hand[0]*scale*side-q.cards[id].attachment.world[0],ay+p.hand[1]*scale-q.cards[id].attachment.world[1])<2);
  }
 }
});

test('main adapter exposes world diagnostics and natural elbow placement at 36.5s',()=>{
 for(const [id,x] of [['A',260],['B',1284]]){
  const p=actorPose(id,{x,y:357,scale:.84,t:36.5});
  assert.equal(p.grip,1);assert.equal(p.handClamped,false);
  assert.ok(p.world.elbow[1]>p.world.shoulder[1]+30);
  assert.ok(p.attachmentError<2);assert.ok(p.contactError<2);
  assert.deepEqual(p.solvedHand,p.hand);
 }
});
