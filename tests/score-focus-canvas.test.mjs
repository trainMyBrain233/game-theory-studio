// Full scene proof includes every parent opacity and the actual selected cell.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {pythonCommand} from '../scripts/python.mjs';
const url=p=>JSON.stringify(new URL(p,import.meta.url).href);
for(const scale of [1,.07,1e-8])test(`${scale}x full scene keeps focused score within its semantic window`,()=>{
 const result=spawnSync(process.execPath,['--import',new URL('../scripts/isolated-fonts.mjs',import.meta.url).pathname,'--input-type=module','-e',`
  import assert from 'node:assert/strict';
  import {createCanvas} from '@napi-rs/canvas';
  import {timeline,sceneData} from ${url('../production/src/model.mjs')};
  import {validateFirstEpisodeTimeline} from ${url('../scripts/validate-data.mjs')};
  import {MATRIX_CELLS} from ${url('../production/src/elements/payoff-matrix.mjs')};
  const scale=${scale};timeline.duration*=scale;
  for(const s of timeline.sections){s.start*=scale;s.end*=scale;}
  for(const s of timeline.segments){for(const f of ['start','end','voiceover_end','spoken_duration','pause_after','display_duration'])s[f]*=scale;for(const e of s.visual_cue.score_reveals??[])e.offset*=scale;}
  validateFirstEpisodeTimeline(timeline,sceneData);process.argv.push('--placeholder-cast');
  const p=await import(${url('../production/src/primitives.mjs')});await p.prepareAssets(1);
  const {drawFrame}=await import(${url('../production/src/scenes.mjs')});
  const canvas=createCanvas(1920,1080),c=canvas.getContext('2d');
  const rgb=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16)).concat(255);
  const render=t=>{drawFrame(canvas,t);return p.records.filter(r=>r.size===52&&r.x<400);};
  for(const [key,[row,col]] of Object.entries(MATRIX_CELLS)){
   const s=timeline.segments.find(s=>s.visual_cue.action==='reveal_scores'&&s.visual_cue.matrix_cell===key),w=s.end-s.start;
   const start=s.start+Math.max(...s.visual_cue.score_reveals.map(e=>e.offset)),d=Math.min(.55,s.end-start);
   const label='('+s.visual_cue.scores.join(', ')+')';
   const selected=()=>{for(const [candidate,[r,k]] of Object.entries(MATRIX_CELLS)){
    assert.deepEqual([...c.getImageData(800+k*480,530+r*170,1,1).data],rgb(candidate===key?p.C.faint:p.C.paper),key+' selected fill '+candidate);
    assert.deepEqual([...c.getImageData(783+k*480,550+r*170,1,1).data],rgb(candidate===key?p.C.ink:p.C.paper),key+' selected border '+candidate);
   }};
   assert.equal(render(start-w*.001).length,0,key+' no focused score before final owner event');selected();
   const mid=render(start+d*.5);assert.equal(mid.length,1);assert.equal(mid[0].text,label);assert(Math.abs(mid[0].alpha-.5)<=1/255,key+' actual parent-composited mid alpha '+mid[0].alpha);selected();
   if(scale===1){
    const reference=createCanvas(1920,1080),r=reference.getContext('2d');r.fillStyle=p.C.paper;r.fillRect(0,0,1920,1080);
    p.reveal(r,start+.55*.5,start,()=>{p.tx(r,'得分',100,739,30,400,p.C.muted);p.tx(r,label,208,744,52,700);});
    assert.deepEqual(c.getImageData(75,680,390,100).data,r.getImageData(75,680,390,100).data,key+' default focused-score historical native pixels');
   }
   const end=render(s.end-w*.00001);assert.equal(end[0].text,label);assert(end[0].alpha>=254/255,key+' focused score fully visible before subtitle changes');
   // Ultrashort scaling is a score numerical-stress case: the separate,
   // unchanged .09s subtitle entrance quantizes below one alpha byte there.
   if(scale>=.07)assert(p.records.some(r=>r.text===s.lines[0]&&r.alpha>0),key+' own subtitle remains visible');
   selected();
   render(s.end+w*.2);
   for(const [r,k] of Object.values(MATRIX_CELLS)){
    assert.deepEqual([...c.getImageData(800+k*480,530+r*170,1,1).data],rgb(p.C.paper),key+' next block has no stale selected fill');
    assert.deepEqual([...c.getImageData(783+k*480,550+r*170,1,1).data],rgb(p.C.paper),key+' next block has no stale selected border');
   }
   const digits=p.records.filter(r=>r.size===64&&r.weight===700&&r.x>900+col*480&&r.x<1140+col*480&&r.y>535+row*170&&r.y<630+row*170);
   assert.equal(digits.length,2,key+' previous matrix cell survives next subtitle');for(const digit of digits)assert.equal(digit.alpha,1,key+' previous score no longer brightens');
   assert.equal(p.records.filter(r=>r.size===52&&r.x<400).length,0,key+' focused explanation follows next semantic block');
   s.visual_cue.score_reveals.reverse();const reverse=render(start+d*.5);assert.deepEqual(reverse,mid,key+' focused ownership invariant under event reorder');
  }
 `],{encoding:'utf8',env:{...process.env,PYTHON:pythonCommand()},timeout:120000});
 assert.equal(result.status,0,result.stdout+result.stderr+(result.error??''));
});
