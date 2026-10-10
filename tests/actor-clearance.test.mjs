import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {actorTextClearance} from '../production/qa/actor-clearance.mjs';
const spacing={figure_name_gap:32,graphic_text_gap_target:24};
const record={x:80,y:80,width:40,height:20,text:'小A',role:'actor-name'};
function sample(x,y=85){const c=createCanvas(240,180);c.getContext('2d').fillRect(x,y,1,1);return c;}
test('actual actor pixels 9–31px from a name fail its configured 32px contract',()=>{
 for(const distance of [9,16,24,31]){
  const mask=sample(120+distance),result=actorTextClearance(mask,record,spacing);
  assert.equal(result.pixels,1);assert.equal(result.nearestDistance,distance);assert.equal(result.minimum,32);
  assert.equal(actorTextClearance(mask,record,{...spacing,figure_name_gap:8}).pixels,0,'Old 8px check would silently pass this art.');
 }
 assert.equal(actorTextClearance(sample(152),record,spacing).pixels,0);
});
test('other text follows its graphic contract and Euclidean corner distance',()=>{
 assert.equal(actorTextClearance(sample(149),{...record,role:'body'},spacing).pixels,0);
 assert.equal(actorTextClearance(sample(143),{...record,role:'body'},spacing).pixels,1);
 assert.equal(actorTextClearance(sample(149,123),record,spacing).pixels,0,'A 37px diagonal gap exceeds the 32px requirement.');
 assert.equal(actorTextClearance(sample(159),record,{...spacing,figure_name_gap:40}).pixels,1);
 assert.throws(()=>actorTextClearance(sample(149),record,{}),/Missing.*contract/);
});
