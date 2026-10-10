import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createCanvas} from '@napi-rs/canvas';
import {drawFrame,timeline} from '../src/scenes.mjs';
import {prepareAssets,records,C,card,badge,resetRecords} from '../src/primitives.mjs';
import {CAST,resolveCastText} from '../src/cast.mjs';
import {SERIF_FAMILY} from '../../typography/fonts.mjs';
import {informationChoreography} from '../src/choreography.mjs';
import {sceneData} from '../src/model.mjs';
import {assertPayoffOwnership} from './payoff-ownership.mjs';
import {validateTimeline} from '../../scripts/validate-data.mjs';
await prepareAssets(1.15);
assert.equal(CAST.actors.A.display_name,'甲');assert.equal(resolveCastText('{{A}}选{{red}}'),'甲选合作');
assert.equal(informationChoreography(38.2).cards.A.kind,'blue');assert.equal(informationChoreography(38.2).cards.B.kind,'red');
const canvas=createCanvas(1920,1080),ctx=canvas.getContext('2d');
const rgb=hex=>hex.slice(1).match(/../g).map(part=>parseInt(part,16));
const frameHash=time=>{drawFrame(canvas,time);return crypto.createHash('sha256').update(canvas.data()).digest('hex')};
let orderSamples=0;
for(const [i,key] of ['RR','RB','BR','BB'].entries()){
 const cue=timeline.segments.find(s=>s.visual_cue.action==='reveal_scores'&&s.visual_cue.matrix_cell===key);
 drawFrame(canvas,cue.end-.1);
 const row=Math.floor(i/2),col=i%2;
 assert.deepEqual([...ctx.getImageData(800+col*480,523+row*170,1,1).data].slice(0,3),rgb(C.faint),`Actual selected cell ${key}`);
 assertPayoffOwnership(records,sceneData.payoffs[row][col],row,col,key);
 assert(records.filter(r=>r.y>950).every(r=>r.size===48&&r.appliedFont.includes('48px')));
 assert(records.some(r=>r.size===72&&r.appliedFont.includes(SERIF_FAMILY)));
 assert(records.every(r=>!r.text.includes('小A')&&!r.text.includes('小B')&&!r.text.includes('{{')));
 const first=crypto.createHash('sha256').update(canvas.data()).digest('hex');
 drawFrame(canvas,27);drawFrame(canvas,cue.end-.1);
 assert.equal(crypto.createHash('sha256').update(canvas.data()).digest('hex'),first);
 // Reordering storage preserves every player's time/value and the aggregate reveal time.
 const events=cue.visual_cue.score_reveals;
 const times=[...new Set([cue.start+.1,cue.end-.1,...events.flatMap(event=>[cue.start+event.offset-.01,cue.start+event.offset+.2,cue.start+event.offset+.5])])].filter(t=>t>=cue.start&&t<cue.end);
 const originals=times.map(frameHash);
 try{
  cue.visual_cue.score_reveals=[...events].reverse();validateTimeline(timeline,sceneData);
  times.forEach((time,index)=>{assert.equal(frameHash(time),originals[index],`${key} reordered events changed the frame at ${time}`);orderSamples++;});
 }finally{cue.visual_cue.score_reveals=events;}
}
console.log(`Episode variation: 4 independently located payoff cells, both score owners, applied 48px/Serif, selected cards and order-independent frames; ${orderSamples} reordered score-event frames are pixel-equivalent.`);
const cards=createCanvas(640,320),paint=cards.getContext('2d');
for(const [kind,x] of [['red',100],['blue',300],['back',500]])card(paint,kind,x,150,140,{label:false});
for(const [x,expected] of [[50,'#8D2638'],[250,'#215F78'],[38,'#FFF7E6'],[238,'#FFF7E6'],[438,'#FFF7E6'],[34,'#1E304F'],[234,'#1E304F'],[434,'#1E304F']])assert.deepEqual([...paint.getImageData(x,150,1,1).data], [...rgb(expected),255],`Configured production card pixel at ${x}`);
// Exercise the production label branch without loading any private character pixels.
const placeholderIndex=process.argv.indexOf('--placeholder-cast');
assert(placeholderIndex>=0);process.argv.splice(placeholderIndex,1);
try{
 resetRecords();badge(paint,'A',100,270,25,{name:true});badge(paint,'B',350,270,25,{name:true});
 assert.deepEqual(records.map(record=>record.text),['甲','乙'],'Production badge names must agree with narration');
 assert(records.every(record=>record.role==='actor-name'),'Configured production names must reach the 32px actor-name QA path.');
}finally{process.argv.splice(placeholderIndex,0,'--placeholder-cast');}
console.log('Production palette: strategy fills, paper and ink pixels follow tokens; production badges use configured display names.');
