import '../scripts/isolated-fonts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {createPayoffMatrixElement} from '../production/src/elements/payoff-matrix.mjs';
import {tx,resetRecords,records,C} from '../production/src/primitives.mjs';
import {canvasFont} from '../typography/fonts.mjs';
import {assertPayoffOwnership} from '../production/qa/payoff-ownership.mjs';

const cases={
 default:[[[3,3],[0,5]],[[5,0],[1,1]]],
 changed:[[[11,12],[21,22]],[[31,32],[41,42]]],
 asymmetric:[[[10,87],[24,69]],[[71,18],[96,40]]],
};
for(const [name,payoffs] of Object.entries(cases))test(`${name}: real matrix ink and owner pixels survive different digit bearings`,()=>{
 const canvas=createCanvas(1920,1080),c=canvas.getContext('2d');
 const reference=createCanvas(1920,1080),r=reference.getContext('2d');
 const timeline={segments:Object.entries({RR:[0,0],RB:[0,1],BR:[1,0],BB:[1,1]}).map(([key,[row,col]])=>({
  start:0,visual_cue:{action:'reveal_scores',matrix_cell:key,score_reveals:payoffs[row][col].map((value,owner)=>({player:owner===0?'A':'B',value,offset:0}))},
 }))};
 const element=createPayoffMatrixElement({timeline,summaryStart:100,drawing:{C,tx,reveal:(_c,_t,_s,draw)=>draw()}});
 const draw=()=>{c.clearRect(0,0,1920,1080);resetRecords();for(const [index,key] of ['RR','RB','BR','BB'].entries())element.scoreValues(c,1,key,1020+index%2*480,588+Math.floor(index/2)*170);};
 draw();
 r.font=canvasFont(64,700);r.textAlign='center';r.textBaseline='alphabetic';r.fillStyle=C.ink;
 for(const [index,key] of ['RR','RB','BR','BB'].entries()){
  const row=Math.floor(index/2),col=index%2,values=payoffs[row][col];
  const glyphs=assertPayoffOwnership(records,values,row,col,key);
  for(const [owner,value] of values.entries()){
   const x=1020+col*480+(owner===0?-64:64),y=609+row*170;
   r.fillText(String(value),x,y);
   // This compares native pixels from the actual production matrix element
   // against independently painted expected owner glyphs, not call arguments.
   const box=glyphs[owner],left=Math.floor(box.x)-1,top=Math.floor(box.y)-1;
   const width=Math.ceil(box.x+box.width)+1-left,height=Math.ceil(box.y+box.height)+1-top;
   assert.deepEqual(c.getImageData(left,top,width,height).data,r.getImageData(left,top,width,height).data,`${key} owner ${owner} actual glyph pixels`);
  }
 }
 // Equal-owner cells cannot expose a swap, so mutate an unequal cell in every
 // case. Preserve values and event timing, changing only their drawn owners.
 const index=timeline.segments.findIndex(s=>s.visual_cue.score_reveals[0].value!==s.visual_cue.score_reveals[1].value);
 const cue=timeline.segments[index].visual_cue;
 const correctRecords=records.map(g=>({...g}));
 const before=Buffer.from(canvas.data());
 for(const event of cue.score_reveals)event.player=event.player==='A'?'B':'A';
 draw();
 assert.notDeepEqual(Buffer.from(canvas.data()),before,'Swapping unequal owners changes actual native pixels.');
 assert.throws(()=>assertPayoffOwnership(records,payoffs[Math.floor(index/2)][index%2],Math.floor(index/2),index%2,cue.matrix_cell),/must be at owner 0's matrix position/);
 // A same-column, wrong-row record must not satisfy ownership either.
 const correct=payoffs[Math.floor(index/2)][index%2];
 assert.throws(()=>assertPayoffOwnership(correctRecords.map(g=>({...g,y:g.y+170})),correct,Math.floor(index/2),index%2,cue.matrix_cell),/must be at owner/);
});

test('12 reproduces the obsolete ink-center assertion while exact ink bounds pass',()=>{
 const c=createCanvas(1920,1080).getContext('2d');resetRecords();
 tx(c,'11',956,609,64,700,C.ink,'center');tx(c,'12',1084,609,64,700,C.ink,'center');
 const glyph=records.find(r=>r.text==='12');
 assert.ok(Math.abs(glyph.x+glyph.width/2-1084)>=1,'Pinned SC font reproduces old smoke failure.');
 assertPayoffOwnership(records,[11,12],0,0,'RR');
});
