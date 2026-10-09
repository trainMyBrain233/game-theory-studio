// Font-free Canvas proof of the real matrix element's selected-cell compositing.
import '../scripts/isolated-fonts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas} from '@napi-rs/canvas';
import {createPayoffMatrixElement,MATRIX_CELLS} from '../production/src/elements/payoff-matrix.mjs';
import {ramp} from '../production/src/motion.mjs';
const ink='#243e66',faint='#e9edf2',paper='#fffef8';
const pixel=(c,x,y)=>[...c.getImageData(x,y,1,1).data];
const rgb=hex=>[...hex.slice(1).matchAll(/../g)].map(m=>parseInt(m[0],16)).concat(255);
const drawing={C:{ink,faint},ramp,tx:()=>{},reveal:()=>{},
 group(c,a,x,y,fn){if(a<=0)return;c.save();c.globalAlpha*=a;c.translate(x,y);fn();c.restore();},
 line(c,x1,y1,x2,y2,color,w,p=1){if(p<=0)return;c.save();c.strokeStyle=color;c.lineWidth=w;c.lineCap='round';c.beginPath();c.moveTo(x1,y1);c.lineTo(x1+(x2-x1)*p,y1+(y2-y1)*p);c.stroke();c.restore();},
 round(c,x,y,w,h,r,fill,stroke,lw){c.save();c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke();}c.restore();},
};
for(const window of [4.1,1,.000001])test(`Canvas selected fill/border/indicators complete inside ${window}s cue with deterministic frame order`,()=>{
 const canvas=createCanvas(1920,1080),c=canvas.getContext('2d');
 const preview=createCanvas(240,135),p=preview.getContext('2d');
 for(const [key,[row,column]] of Object.entries(MATRIX_CELLS)) {
  const start=100,end=start+window,timeline={segments:[
   {start,end,visual_cue:{action:'highlight_choices',matrix_cell:key}},
   {start:end,end:end+1,visual_cue:{action:'reveal_scores',matrix_cell:key,score_reveals:[]}},
  ]};
  const element=createPayoffMatrixElement({timeline,summaryStart:Infinity,drawing});
  const render=t=>{c.fillStyle=paper;c.fillRect(0,0,1920,1080);element.draw(c,t);p.drawImage(canvas,0,0,240,135);return createHash('sha256').update(p.getImageData(0,0,240,135).data).digest('hex');};
  const times=[start-window*.001,start,start+window*.25,start+window*.5,start+window*.75,end-window*.001,end,end+window*.001];
  const hashes=times.map(render);
  for(const i of [6,2,7,0,4,4,1,5,3])assert.equal(render(times[i]),hashes[i]);
  render(end);
  for(const [candidate,[r,col]] of Object.entries(MATRIX_CELLS)) {
   assert.deepEqual(pixel(c,800+col*480,530+r*170),rgb(candidate===key?faint:paper),`${key} fill ${candidate}`);
   assert.deepEqual(pixel(c,783+col*480,550+r*170),rgb(candidate===key?ink:paper),`${key} border ${candidate}`);
  }
  assert.deepEqual(pixel(c,757,620+row*170),rgb(ink));
  assert.deepEqual(pixel(c,1180+column*480,488),rgb(ink));
  render(start);assert.deepEqual(pixel(c,800+column*480,530+row*170),rgb(paper));
  render(end-window*.001);assert.notDeepEqual(pixel(c,783+column*480,550+row*170),rgb(paper));
 }
});
