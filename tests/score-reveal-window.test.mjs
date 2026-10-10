// Real Canvas text alpha/pixels, not a timing declaration from the element.
import '../scripts/isolated-fonts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCanvas} from '@napi-rs/canvas';
import {createPayoffMatrixElement,MATRIX_CELLS} from '../production/src/elements/payoff-matrix.mjs';
import * as drawing from '../production/src/primitives.mjs';
import {validateFirstEpisodeTimeline} from '../scripts/validate-data.mjs';
const source=JSON.parse(fs.readFileSync(new URL('../chapters/01-four-elements/narration/timeline.json',import.meta.url)));
const scenes=JSON.parse(fs.readFileSync(new URL('../design/scenes.json',import.meta.url)));
const rgb=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16)).concat(255);
const pixel=(c,x,y)=>[...c.getImageData(x,y,1,1).data];
function retime(scale){
 const timeline=structuredClone(source);timeline.duration*=scale;
 for(const s of timeline.sections){s.start*=scale;s.end*=scale;}
 for(const s of timeline.segments){
  for(const f of ['start','end','voiceover_end','spoken_duration','pause_after','display_duration'])s[f]*=scale;
  for(const e of s.visual_cue.score_reveals??[])e.offset*=scale;
 }
 validateFirstEpisodeTimeline(timeline,scenes);return timeline;
}
for(const scale of [1,.07,1e-8])test(`${scale}x: native owner ink completes in all four score windows, independent of event/frame order`,()=>{
 const timeline=retime(scale),canvas=createCanvas(1920,1080),c=canvas.getContext('2d');
 const element=createPayoffMatrixElement({timeline,summaryStart:Infinity,drawing});
 for(const [key,[row,col]] of Object.entries(MATRIX_CELLS)){
  const s=timeline.segments.find(s=>s.visual_cue.action==='reveal_scores'&&s.visual_cue.matrix_cell===key);
  const cx=1020+col*480,cy=588+row*170,w=s.end-s.start;
  const render=t=>{c.clearRect(0,0,1920,1080);drawing.resetRecords();element.scoreValues(c,t,key,cx,cy);return Buffer.from(c.getImageData(cx-110,cy-65,220,105).data);};
  for(const e of s.visual_cue.score_reveals){
   const start=s.start+e.offset,d=Math.min(.38,s.end-start),ownerX=cx+(e.player==='A'?-64:64);
   const record=()=>drawing.records.find(r=>r.size===64&&r.weight===700&&Math.abs(r.x+r.width/2-ownerX)<20);
   render(start-w*1e-5);assert.equal(record(),undefined,`${key}/${e.player}: hidden before own event`);
   render(start);assert.equal(record(),undefined,`${key}/${e.player}: hidden at own event`);
   render(start+d*.5);assert(Math.abs(record().alpha-.5)<=1/255,`${key}/${e.player}: actual mid-fade alpha ${record()?.alpha}`);
   render(s.end);assert.equal(record().alpha,1,`${key}/${e.player}: fully opaque at own end`);
   const endPixels=Buffer.from(c.getImageData(ownerX-48,cy-65,96,105).data);
   render(s.end+w*.2);assert.equal(record().alpha,1);
   assert.deepEqual(Buffer.from(c.getImageData(ownerX-48,cy-65,96,105).data),endPixels,`${key}/${e.player}: glyph does not brighten/move in next subtitle`);
  }
  const times=[s.start-w*.001,s.start,...s.visual_cue.score_reveals.flatMap(e=>{const a=s.start+e.offset;return [a-w*.001,a,a+Math.min(.38,s.end-a)*.25,a+Math.min(.38,s.end-a)*.5,a+Math.min(.38,s.end-a)*.75];}),s.end-w*.001,s.end,s.end+w*.001,s.end+w*.2];
  const expected=times.map(render);s.visual_cue.score_reveals.reverse();
  for(const i of [...times.keys()].reverse())assert.deepEqual(render(times[i]),expected[i],`${key}: reversed owner storage/frame order at ${times[i]}`);
  // During the owner's score block, the real selected-cell fill/border must
  // remain on that cell through every score entrance and the final own frame.
  for(const t of [s.start,...s.visual_cue.score_reveals.map(e=>s.start+e.offset+w*.01),s.end-w*.0001]){
   c.fillStyle=drawing.C.paper;c.fillRect(0,0,1920,1080);element.draw(c,t);
   for(const [candidate,[r,k]] of Object.entries(MATRIX_CELLS)){
    assert.deepEqual(pixel(c,800+k*480,530+r*170),rgb(candidate===key?drawing.C.faint:drawing.C.paper),`${key} fill ${candidate}`);
    assert.deepEqual(pixel(c,783+k*480,550+r*170),rgb(candidate===key?drawing.C.ink:drawing.C.paper),`${key} border ${candidate}`);
   }
  }
 }
});

test('default score entrances retain historical .38s native pixels exactly',()=>{
 const timeline=retime(1),canvas=createCanvas(1920,1080),reference=createCanvas(1920,1080),c=canvas.getContext('2d'),r=reference.getContext('2d');
 const element=createPayoffMatrixElement({timeline,summaryStart:Infinity,drawing});
 for(const [key,[row,col]] of Object.entries(MATRIX_CELLS)){
  const s=timeline.segments.find(s=>s.visual_cue.action==='reveal_scores'&&s.visual_cue.matrix_cell===key),cx=1020+col*480,cy=588+row*170;
  for(const event of s.visual_cue.score_reveals)for(const fraction of [-.001,0,.25,.5,.75,1,1.001]){
   const t=s.start+event.offset+.38*fraction;c.clearRect(0,0,1920,1080);r.clearRect(0,0,1920,1080);element.scoreValues(c,t,key,cx,cy);
   if(t>=s.start){
    for(const [glyph,dx] of [['(',-126],[',',0],[')',126]])drawing.tx(r,glyph,cx+dx,cy+21,64,400,drawing.C.ink,'center');
    for(const e of s.visual_cue.score_reveals)drawing.reveal(r,t,s.start+e.offset,()=>drawing.tx(r,String(e.value),cx+(e.player==='A'?-64:64),cy+21,64,700,drawing.C.ink,'center'),{d:.38,dy:6});
   }
   assert.deepEqual(c.getImageData(cx-160,cy-65,320,105).data,r.getImageData(cx-160,cy-65,320,105).data,`${key} original native reveal pixels at ${fraction}`);
  }
 }
});
