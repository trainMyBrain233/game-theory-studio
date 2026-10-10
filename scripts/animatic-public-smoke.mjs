import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createCanvas} from '@napi-rs/canvas';
import {createRenderSession,PUBLIC_AVATAR_TRACKS} from '../production/src/animatic/render-frame.mjs';
import {avatarTransitionFrames,alphaInkBounds,drawAvatarSample} from '../production/src/animatic/avatar.mjs';
import {createRasterCache} from '../production/src/animatic/raster-cache.mjs';
import {syntheticCast} from '../tests/fixtures/animatic/synthetic-cast.mjs';

export function assertRasterClearance(rendered,adapters,gap=32) {
 const {textMask,avatarRecords}=rendered,{width,height}=textMask;
 const text=textMask.getContext('2d').getImageData(0,0,width,height).data;
 for(const {id,sample,bounds} of avatarRecords){
  if(!bounds)continue;
  assert(bounds.x>=0 && bounds.y>=0 && bounds.x+bounds.width<=width && bounds.y+bounds.height<=height,'Avatar ink must not be clipped');
  const layer=createCanvas(width,height);drawAvatarSample(layer.getContext('2d'),adapters[id],sample);
  const ink=alphaInkBounds(layer);layer.width=1;layer.height=1;assert(ink,'Visible avatar must have actual ink');
  // Conservative expanded actual-alpha rectangle: absence of text in this box
  // proves >=gap pixels to every avatar pixel, including transparent head hats.
  for(let y=Math.max(0,ink.y-gap);y<Math.min(height,ink.y+ink.height+gap);y++)for(let x=Math.max(0,ink.x-gap);x<Math.min(width,ink.x+ink.width+gap);x++)assert.equal(text[(y*width+x)*4+3],0,`Avatar ${id} lacks ${gap}px clearance from visible text ink`);
 }
}
export function runAnimaticPublicSmoke(){
 const plan=JSON.parse(fs.readFileSync(new URL('../tests/fixtures/animatic/minimal-plan.json',import.meta.url),'utf8'));
 const adapters=syntheticCast(),session=createRenderSession({plan,adapters}),cache=createRasterCache(session,{maxEntries:8});
 const boundaries=[0,plan.durationFrames-1,...plan.blocks.flatMap(block=>[block.startFrame,block.endFrame,...block.subtitles.flatMap(phase=>[phase.startFrame,phase.endFrame]),...block.events.flatMap(event=>[event.frame,...(event.type==='joint_reveal'?[event.frame+event.durationFrames]:[])])]),...Object.values(PUBLIC_AVATAR_TRACKS).flatMap(avatarTransitionFrames)];
 const frames=[...new Set(boundaries.flatMap(frame=>[frame-1,frame,frame+1]))].filter(frame=>frame>=0&&frame<plan.durationFrames).sort((a,b)=>a-b);
 const expected=new Map();
 for(const frame of frames){const rendered=session.render(frame);assertRasterClearance(rendered,adapters);const bytes=rendered.canvas.toBuffer('image/png');rendered.dispose();expected.set(frame,bytes);assert.deepEqual(cache.get(frame),bytes);assert.deepEqual(cache.get(frame),bytes);}
 for(const frame of [...frames].reverse())assert.deepEqual(cache.get(frame),expected.get(frame));
 console.log(`Public animatic synthetic smoke: ${frames.length} boundary/transition frames; cold, cached, reverse-order bytes and all-visible-text alpha clearance passed. No full-episode or audio claim.`);
 return {frames:frames.length,fingerprint:session.fingerprint};
}
if(process.argv[1]===fileURLToPath(import.meta.url))runAnimaticPublicSmoke();
