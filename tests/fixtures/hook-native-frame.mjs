import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createCanvas} from '@napi-rs/canvas';
import {timeline,sceneData} from '../../production/src/model.mjs';
import {validateFirstEpisodeTimeline} from '../../scripts/validate-data.mjs';
const scale=Number(process.env.HOOK_SCALE??.3);
timeline.duration*=scale;
for(const s of timeline.sections){s.start*=scale;s.end*=scale;}
for(const s of timeline.segments){for(const f of ['start','end','voiceover_end','spoken_duration','pause_after','display_duration'])s[f]*=scale;for(const e of s.visual_cue.score_reveals??[])e.offset*=scale;}
validateFirstEpisodeTimeline(timeline,sceneData);
process.argv.push('--placeholder-cast');
const primitives=await import('../../production/src/primitives.mjs');
const {prepareAssets,C,tx,arrow}=primitives;await prepareAssets(1);
const {drawFrame}=await import('../../production/src/scenes.mjs');
const results=[];
for(const fraction of JSON.parse(process.env.HOOK_FRACTIONS??'[0.875]')){
 const s=timeline.segments[0],time=s.start+(s.end-s.start)*fraction;
 const canvas=createCanvas(1920,1080),c=drawFrame(canvas,time);
 const labels=['我的选择','对方的选择','怎样影响得分？'];
 const alpha=labels.map(text=>primitives.records.find(r=>r.text===text)?.alpha??0);
 const expected=createCanvas(1920,1080),e=expected.getContext('2d');e.fillStyle=C.paper;e.fillRect(0,0,1920,1080);
 tx(e,labels[0],810,497,34,700,C.ink,'center');tx(e,labels[1],1110,497,34,700,C.ink,'center');tx(e,labels[2],960,631,43,700,C.ink,'center');
 arrow(e,760,550,895,550);arrow(e,1160,550,1025,550);
 const rois=[[738,457,145,45],[1015,457,190,45],[790,582,340,55],[755,537,145,26],[1020,537,145,26]];
 const pixelsMatch=rois.map(roi=>Buffer.from(c.getImageData(...roi).data).equals(Buffer.from(e.getImageData(...roi).data)));
 if(process.env.HOOK_PROOF_DIR){fs.mkdirSync(process.env.HOOK_PROOF_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.HOOK_PROOF_DIR,`${scale}-${fraction}.png`),canvas.toBuffer('image/png'));}
 results.push({scale,fraction,time,alpha,pixelsMatch,hash:crypto.createHash('sha256').update(canvas.data()).digest('hex')});
}
console.log(JSON.stringify(results));
