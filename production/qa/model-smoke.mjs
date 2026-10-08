import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createCanvas} from '@napi-rs/canvas';
import {drawFrame,timeline} from '../src/scenes.mjs';
import {prepareAssets,records,C} from '../src/primitives.mjs';
import {CAST,resolveCastText} from '../src/cast.mjs';
import {SERIF_FAMILY} from '../../typography/fonts.mjs';
import {informationChoreography} from '../src/choreography.mjs';
await prepareAssets(1.15);
assert.equal(CAST.actors.A.display_name,'甲');assert.equal(resolveCastText('{{A}}选{{red}}'),'甲选合作');
assert.equal(informationChoreography(38.2).cards.A.kind,'blue');assert.equal(informationChoreography(38.2).cards.B.kind,'red');
const canvas=createCanvas(1920,1080),ctx=canvas.getContext('2d');
const rgb=hex=>hex.slice(1).match(/../g).map(part=>parseInt(part,16));
for(const [i,key] of ['RR','RB','BR','BB'].entries()){
 const cue=timeline.segments.find(s=>s.visual_cue.action==='reveal_scores'&&s.visual_cue.matrix_cell===key);
 drawFrame(canvas,cue.end-.1);
 const row=Math.floor(i/2),col=i%2,cx=1020+col*480;
 assert.deepEqual([...ctx.getImageData(800+col*480,523+row*170,1,1).data].slice(0,3),rgb(C.faint),`Actual selected cell ${key}`);
 for(let owner=0;owner<2;owner++){
  const expected=cue.visual_cue.scores[owner],center=cx+(owner===0?-64:64);
  const glyph=records.find(r=>r.text===String(expected)&&r.size===64&&Math.abs(r.x+r.width/2-center)<1);
  assert(glyph,`${key} score ${expected} must be at owner ${owner}'s matrix position`);
  assert.match(glyph.appliedFont,/64px/);
 }
 assert(records.filter(r=>r.y>950).every(r=>r.size===48&&r.appliedFont.includes('48px')));
 assert(records.some(r=>r.size===72&&r.appliedFont.includes(SERIF_FAMILY)));
 assert(records.every(r=>!r.text.includes('小A')&&!r.text.includes('小B')&&!r.text.includes('{{')));
 const first=crypto.createHash('sha256').update(canvas.data()).digest('hex');
 drawFrame(canvas,27);drawFrame(canvas,cue.end-.1);
 assert.equal(crypto.createHash('sha256').update(canvas.data()).digest('hex'),first);
}
console.log('Episode variation: 4 independently located payoff cells, both score owners, applied 48px/Serif, selected cards and order-independent frames passed.');
