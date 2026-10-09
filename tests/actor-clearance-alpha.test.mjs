import test from 'node:test';
import assert from 'node:assert/strict';
import {actorTextClearance} from '../production/qa/actor-clearance.mjs';

const spacing={figure_name_gap:32,graphic_text_gap_target:24};
const record={x:80,y:80,width:40,height:20,role:'actor-name'};
// A synthetic RGBA mask exercises the same getImageData contract without
// loading Canvas, fonts, private artwork or a rendering process.
function mask(alpha,{x=149,y=85}={}){
 return {width:240,height:180,getContext(kind){
  assert.equal(kind,'2d');
  return {getImageData(left,top,width,height){
   const data=new Uint8ClampedArray(width*height*4);
   if(x>=left&&x<left+width&&y>=top&&y<top+height)data[((y-top)*width+x-left)*4+3]=alpha;
   return {data};
  }};
 }};
}

test('every nonzero alpha byte is authoritative for actor/text clearance by default',()=>{
 assert.deepEqual(actorTextClearance(mask(0),record,spacing),{minimum:32,pixels:0,nearestDistance:null});
 for(let alpha=1;alpha<=255;alpha++){
  assert.deepEqual(actorTextClearance(mask(alpha),record,spacing),{minimum:32,pixels:1,nearestDistance:29},`alpha ${alpha}`);
 }
 for(const x of [121,129,144,151])assert.equal(actorTextClearance(mask(1,{x}),record,spacing).pixels,1);
 assert.equal(actorTextClearance(mask(1,{x:152}),record,spacing).pixels,0,'An exact 32px gap is allowed.');
 assert.equal(actorTextClearance(mask(1,{x:143}),{...record,role:'body'},spacing).pixels,1);
 assert.equal(actorTextClearance(mask(1,{x:144}),{...record,role:'body'},spacing).pixels,0);
});

test('an explicit threshold discards alpha at or below its integer byte value',()=>{
 for(const threshold of [0,1,40,254,255]){
  assert.equal(actorTextClearance(mask(threshold),record,spacing,{alphaThreshold:threshold}).pixels,0);
  if(threshold<255)assert.equal(actorTextClearance(mask(threshold+1),record,spacing,{alphaThreshold:threshold}).pixels,1);
 }
});

test('malformed alpha thresholds fail before reading the mask instead of weakening QA',()=>{
 const unreadable={getContext(){throw Error('Mask read boundary reached');}};
 for(const alphaThreshold of [-1,256,.5,NaN,Infinity,-Infinity,'0','40',null,true,{}]){
  assert.throws(()=>actorTextClearance(unreadable,record,spacing,{alphaThreshold}),/alphaThreshold.*integer.*0.*255/);
 }
});
