// Each native scene is rendered in its own process: do not accumulate native
// font/image allocations while testing many retimed frames in one renderer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {pythonCommand} from '../scripts/python.mjs';
const url=p=>JSON.stringify(new URL(p,import.meta.url).href);
for(const [id,fraction,labels] of [
 ['s09_simultaneous',.8,['先各自选好','再一起亮牌']],
 ['s21_rows',.9,['行','先找{{A}}的行']],
])test(`native 0.3x ${id} renders its completed teaching cue before the next subtitle`,()=>{
 const result=spawnSync(process.execPath,['--import',new URL('../scripts/isolated-fonts.mjs',import.meta.url).pathname,'--input-type=module','-e',`
  import assert from 'node:assert/strict';
  import fs from 'node:fs';
  import path from 'node:path';
  import {createCanvas} from '@napi-rs/canvas';
  import {timeline,sceneData,resolveCastText} from ${url('../production/src/model.mjs')};
  import {validateFirstEpisodeTimeline} from ${url('../scripts/validate-data.mjs')};
  timeline.duration*=.3;
  for(const s of timeline.sections){s.start*=.3;s.end*=.3;}
  for(const s of timeline.segments){
   for(const f of ['start','end','voiceover_end','spoken_duration','pause_after','display_duration'])s[f]*=.3;
   for(const e of s.visual_cue.score_reveals??[])e.offset*=.3;
  }
  validateFirstEpisodeTimeline(timeline,sceneData);
  process.argv.push('--placeholder-cast');
  const primitives=await import(${url('../production/src/primitives.mjs')});
  const {prepareAssets,C}=primitives;await prepareAssets(1);
  const {drawFrame}=await import(${url('../production/src/scenes.mjs')});
  const s=timeline.segments.find(s=>s.id===${JSON.stringify(id)}),canvas=createCanvas(1920,1080);
  drawFrame(canvas,s.start+(s.end-s.start)*${fraction});
  if(process.env.WINDOW_TIMING_PROOF_DIR){
   fs.mkdirSync(process.env.WINDOW_TIMING_PROOF_DIR,{recursive:true});
   fs.writeFileSync(path.join(process.env.WINDOW_TIMING_PROOF_DIR,${JSON.stringify(id)}+'.png'),canvas.toBuffer('image/png'));
  }
  for(const label of ${JSON.stringify(labels)})assert(primitives.records.some(r=>r.text===resolveCastText(label)&&r.alpha===1),label);
  assert(primitives.records.some(r=>r.text===s.lines[0]&&r.alpha>0),'matching subtitle');
  const c=canvas.getContext('2d');
  if(${JSON.stringify(id)}==='s21_rows'){
   const ink=[...C.ink.slice(1).matchAll(/../g)].map(m=>parseInt(m[0],16)).concat(255);
   assert.deepEqual([...c.getImageData(780,650,1,1).data],ink,'completed native vertical grid');
  }else{
   const rgb=color=>[...color.slice(1).matchAll(/../g)].map(m=>parseInt(m[0],16));
   // Interior color patches, away from card text and borders, prove both
   // selected face images are visible after the simultaneous flip.
   for(const [x,kind] of [[470,sceneData.selected.actorA],[1444,sceneData.selected.actorB]])
    assert.deepEqual([...c.getImageData(x,750,1,1).data].slice(0,3),rgb(C[kind]));
  }
 `],{encoding:'utf8',env:{...process.env,PYTHON:pythonCommand()},timeout:60000});
 assert.equal(result.status,0,result.stdout+result.stderr+(result.error??''));
});
