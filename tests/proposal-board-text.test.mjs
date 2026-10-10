import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {comparisonBoardTextPlan,COMPARISON_BOARD} from '../design/comparison-board-text.mjs';

const tokens=JSON.parse(fs.readFileSync(new URL('../design/tokens.json',import.meta.url)));
test('one pure plan covers every comparison-only heading, subtitle and scene caption',()=>{
 assert.deepEqual(COMPARISON_BOARD,{width:3840,height:1320,headerHeight:200});
 for(const original of Object.values(tokens.styles)){
  for(const family of ['sans','serif']){
   const style={...original,name:'标题ع',subtitle:'说明غ',titleFamily:family},before=JSON.stringify(style);
   const plan=comparisonBoardTextPlan(style);
   assert.deepEqual(plan.map(run=>run.id),['heading','subtitle','participants-caption','payoff-caption']);
   assert.deepEqual(plan.map(run=>run.text),['标题ع','说明غ','场景一 · 参与者','场景二 · 收益矩阵']);
   assert.deepEqual(plan.map(run=>run.family),[family,'sans','sans','sans']);
   assert.deepEqual(plan.map(run=>run.size),[62,38,60,60]);
   assert.equal(JSON.stringify(style),before,'Planning cannot alter authored data');
  }
 }
});

test('comparison captions retain a 30px readable size in the 1920px preview',()=>{
 const previewScale=1920/COMPARISON_BOARD.width;
 for(const style of Object.values(tokens.styles)){
  const captions=comparisonBoardTextPlan(style).filter(run=>run.id.endsWith('-caption'));
  assert.equal(captions.length,2);
  for(const caption of captions){
   assert.equal(caption.size*previewScale,30);
   assert.equal(caption.weight,700);
   assert.equal(caption.y,165);
  }
 }
});
