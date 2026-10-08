/** Two original text scenes exercise the transition module and real Canvas API.
 * Run after font preparation with the isolated-font preload, like episode QA.
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas} from '@napi-rs/canvas';
import {C,group,reveal,tx,resetRecords,records} from '../src/primitives.mjs';
import {textTransitionState} from '../src/motion.mjs';

const scenes=[
 {id:'title',text:'建立共同问题',size:52,start:1,d:.6,dy:24,exitStart:3,exitDuration:.4,exitDy:-18},
 {id:'definition',text:'先明确参与者，再描述选择',size:40,start:.5,d:.4,dy:12,exitStart:2.5,exitDuration:.7,exitDy:20},
];
const out=new URL('../../artifacts/motion-demo/',import.meta.url);
fs.mkdirSync(out,{recursive:true});
const canvas=createCanvas(1920,1080),context=canvas.getContext('2d');
const hash=()=>createHash('sha256').update(canvas.data()).digest('hex');
function draw(scene,t,{legacyReveal=false}={}){
 context.clearRect(0,0,1920,1080);context.fillStyle=C.paper;context.fillRect(0,0,1920,1080);resetRecords();
 const state=textTransitionState(t,scene.start,scene),text=()=>tx(context,scene.text,960,560,scene.size,700,C.ink,'center');
 if(legacyReveal)reveal(context,t,scene.start,text,{d:scene.d,dy:scene.dy});
 else group(context,state.alpha,state.dx,state.dy,text);
 return {t,sha256:hash(),state,text:records.map(record=>({...record}))};
}
const report=[];
for(const scene of scenes){
 const enterEnd=scene.start+scene.d,exitEnd=scene.exitStart+scene.exitDuration;
 const points=new Set([scene.start-1/30,enterEnd,(enterEnd+scene.exitStart)/2,scene.exitStart,exitEnd+1/30]);
 for(const [start,d] of [[scene.start,scene.d],[scene.exitStart,scene.exitDuration]]){
  for(const p of [0,.25,.5,.75,1])for(const delta of [-1/30,0,1/30])points.add(start+d*p+delta);
 }
 const frames=[...points].sort((a,b)=>a-b).map(t=>draw(scene,t));
 const before=draw(scene,scene.start-1/30),after=draw(scene,exitEnd+1/30);
 assert.equal(before.sha256,after.sha256,`${scene.id}: entry and exit leave the background intact`);
 assert.equal(before.text.length,0);assert.equal(after.text.length,0);
 const hold=draw(scene,(enterEnd+scene.exitStart)/2),atEntryEnd=draw(scene,enterEnd),atExitStart=draw(scene,scene.exitStart);
 assert.equal(hold.sha256,atEntryEnd.sha256,`${scene.id}: text is stable throughout the reading hold`);
 assert.equal(hold.sha256,atExitStart.sha256);
 const enterQuarter=draw(scene,scene.start+scene.d*.25),enterHalf=draw(scene,scene.start+scene.d*.5),exitHalf=draw(scene,scene.exitStart+scene.exitDuration*.5);
 assert.notEqual(enterQuarter.sha256,enterHalf.sha256,`${scene.id}: actual entrance pixels change`);
 assert.notEqual(enterHalf.sha256,hold.sha256);assert.notEqual(exitHalf.sha256,hold.sha256);
 for(const frame of [enterQuarter,enterHalf,exitHalf]){
  assert.equal(frame.text.length,1);
  assert.ok(Math.abs(frame.text[0].alpha-frame.state.alpha)<=1/255,`${scene.id}: Canvas alpha agrees within its 8-bit precision`);
  assert.ok(Math.abs(frame.text[0].y-hold.text[0].y-frame.state.dy)<1e-10,`${scene.id}: actual text follows the pure vertical state`);
 }
 for(const frame of [...frames].reverse())assert.equal(draw(scene,frame.t).sha256,frame.sha256,`${scene.id}: repeated out-of-order frame ${frame.t}`);
 for(const p of [0,.25,.5,.75,1]){
  const t=scene.start+scene.d*p,pure=draw(scene,t);
  assert.equal(draw(scene,t,{legacyReveal:true}).sha256,pure.sha256,`${scene.id}: episode reveal wrapper consumes the same entrance`);
 }
 for(const [name,t] of [['entry-quarter',scene.start+scene.d*.25],['entry-half',scene.start+scene.d*.5],['hold',(enterEnd+scene.exitStart)/2],['exit-half',scene.exitStart+scene.exitDuration*.5],['after',exitEnd+1/30]]){
  draw(scene,t);fs.writeFileSync(new URL(`${scene.id}-${name}.png`,out),canvas.toBuffer('image/png'));
 }
 report.push({scene:scene.id,frames:frames.map(({text,...frame})=>({...frame,textBounds:text.map(({text,x,y,width,height,alpha})=>({text,x,y,width,height,alpha}))}))});
}
fs.writeFileSync(new URL('report.json',out),JSON.stringify({width:1920,height:1080,mode:'original-text-only',scenes:report},null,2)+'\n');
console.log(`Shared motion demo: ${scenes.length} original text scenes, ${report.reduce((sum,scene)=>sum+scene.frames.length,0)} frames; entrance/hold/exit pixels, adjacent frames and reordered requests passed.`);
