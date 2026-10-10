import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createCanvas} from '@napi-rs/canvas';
import {timeline,sceneData} from '../../production/src/model.mjs';
import {validateFirstEpisodeTimeline} from '../../scripts/validate-data.mjs';
const scale=Number(process.env.FOUR_QUESTIONS_SCALE??.3),fraction=Number(process.env.FOUR_QUESTIONS_FRACTION??.8);
timeline.duration*=scale;
for(const s of timeline.sections){s.start*=scale;s.end*=scale;}
for(const s of timeline.segments){for(const f of ['start','end','voiceover_end','spoken_duration','pause_after','display_duration'])s[f]*=scale;for(const e of s.visual_cue.score_reveals??[])e.offset*=scale;}
validateFirstEpisodeTimeline(timeline,sceneData);
process.argv.push('--placeholder-cast');
const primitives=await import('../../production/src/primitives.mjs');
const {prepareAssets,C,tx}=primitives;await prepareAssets(1);
const {drawFrame}=await import('../../production/src/scenes.mjs');
for(const fraction of JSON.parse(process.env.FOUR_QUESTIONS_FRACTIONS??`[${Number(process.env.FOUR_QUESTIONS_FRACTION??.8)}]`)){
const s=timeline.segments.find(s=>s.id==='s02_four_questions'),time=s.start+(s.end-s.start)*fraction;
const canvas=createCanvas(1920,1080),c=drawFrame(canvas,time);
const labels=['参与者','信息','策略','收益'];
const alpha=labels.map(text=>primitives.records.find(r=>r.text===text)?.alpha??0);
// Compare actual glyph pixels against independent fully opaque text at the
// intended final baseline. This fails on faded or vertically unfinished ink.
const expected=createCanvas(1920,1080),e=expected.getContext('2d');e.fillStyle=C.paper;e.fillRect(0,0,1920,1080);
labels.forEach((text,i)=>tx(e,text,745+143*i,548,34,700,C.ink,'center'));
const pixelsMatch=labels.map((text,i)=>Buffer.from(c.getImageData(685+143*i,509,120,45).data).equals(Buffer.from(e.getImageData(685+143*i,509,120,45).data)));
if(process.env.FOUR_QUESTIONS_PROOF_DIR){fs.mkdirSync(process.env.FOUR_QUESTIONS_PROOF_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.FOUR_QUESTIONS_PROOF_DIR,`${scale}-${fraction}.png`),canvas.toBuffer('image/png'));}
console.log(JSON.stringify({scale,fraction,time,alpha,pixelsMatch,hash:crypto.createHash('sha256').update(canvas.data()).digest('hex')}));

}
