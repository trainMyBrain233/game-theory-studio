import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {informationChoreography} from '../production/src/choreography.mjs';
import {payoffEntryState} from '../production/src/payoff-entry-timing.mjs';
import {kinematicRamp as kr,ramp,pulse} from '../production/src/motion.mjs';
import {validateFirstEpisodeTimeline} from '../scripts/validate-data.mjs';
const source=JSON.parse(fs.readFileSync(new URL('../chapters/01-four-elements/narration/timeline.json',import.meta.url)));
const sceneData=JSON.parse(fs.readFileSync(new URL('../design/scenes.json',import.meta.url)));
const retimeCode=`
 timeline.duration*=scale;
 for(const s of timeline.sections){s.start*=scale;s.end*=scale;}
 for(const s of timeline.segments){
  for(const f of ['start','end','voiceover_end','spoken_duration','pause_after','display_duration'])s[f]*=scale;
  for(const e of s.visual_cue.score_reveals??[])e.offset*=scale;
  s.visual_cue.score_reveals?.reverse();
 }
 validateFirstEpisodeTimeline(timeline,sceneData);`;
function retime(scale){const timeline=structuredClone(source);eval(retimeCode);return timeline;}
const get=(timeline,id)=>timeline.segments.find(s=>s.id===id);
function state(t,timeline){const {handTarget,...info}=informationChoreography(t,{timeline});return {info,payoff:payoffEntryState(t,timeline),hands:[handTarget('A',[100,200]),handTarget('B',[300,400])]};}
function finite(value){if(typeof value==='number')assert(Number.isFinite(value));else if(value&&typeof value==='object')Object.values(value).forEach(finite);}
for(const scale of [1,.3,1.3,1e-8])test(`${scale}x: entire information and matrix entrances settle within their narration windows`,()=>{
 const timeline=retime(scale);
 for(const id of ['s08_known_unknown','s09_simultaneous','s21_rows','s22_columns']){
  const s=get(timeline,id),w=s.end-s.start,times=[-.001,0,.25,.5,.75,.9,.96,.999,1,1.001].map(p=>s.start+w*p);
  const snapshots=times.map(t=>{const v=state(t,timeline);finite(v);return v;});
  for(const i of [9,2,6,0,5,3,3,1,8,4,7])assert.deepEqual(state(times[i],timeline),snapshots[i]);
  const {info,payoff}=state(s.start+w*.96,timeline);
  if(id==='s08_known_unknown'){
   for(const key of ['move','hidden','observation','rules'])assert.equal(info[key],1,key);
   assert.equal(info.unused,0);assert.equal(info.grip,0);assert.equal(info.cards.A.y,786);assert.equal(info.cards.B.y,786);
  }
  if(id==='s09_simultaneous'){
   assert.equal(info.reveal,1);assert.equal(info.hidden,0);assert.equal(info.grip,0);
   assert.equal(info.cards.A.y,786);assert.equal(info.cards.B.y,786);
   const hold=state(s.start+w*.8,timeline).info;assert.equal(hold.reveal,1);assert.equal(hold.explanation,1);assert.equal(hold.observation,0);
  }
  if(id==='s21_rows'){
   for(const key of ['move','rows','names','grid'])assert.equal(payoff[key],1,key);
   assert.equal(payoff.showExplanation,true);assert.equal(payoff.cols,0);assert.equal(payoff.oldExit,0);
  }
  if(id==='s22_columns')assert.equal(payoff.cols,1);
 }
});
test('reproduces both accepted 0.3x late entrances',()=>{
 const timeline=retime(.3),s9=get(timeline,'s09_simultaneous'),s21=get(timeline,'s21_rows');
 assert.equal(kr(s9.end,s9.start+1.7,.9),0);
 assert.equal(ramp(s21.end,s21.start+1.5,.7),0);
 assert.equal(state(s9.end,timeline).info.reveal,1);
 assert.equal(state(s21.end,timeline).payoff.grid,1);
});
test('default and extended timing preserve historical arithmetic exactly',()=>{
 for(const scale of [1,1.3]){
  const timeline=retime(scale),a=get(timeline,'s08_known_unknown').start,b=get(timeline,'s09_simultaneous').start,pick=a+1.25;
  const row=get(timeline,'s21_rows').start,col=get(timeline,'s22_columns').start;
  for(let i=0;i<=1000;i++){
   const t=a-1+(col-a+8)*i/1000,{info:q,payoff:p}=state(t,timeline);
   assert.equal(q.move,kr(t,pick+.5,1.3));assert.equal(q.unused,1-kr(t,pick+.4,.6));
   assert.equal(q.reveal,kr(t,b+1.7,.9));assert.equal(q.hidden,kr(t,a+2.35,.85)*(1-q.reveal));
   assert.equal(q.cards.A.y,786-24*pulse(t,pick+.35,2.4)-18*pulse(t,b+1.3,2.1));
   assert.equal(q.grip,Math.max(kr(t,pick,.5)*(1-kr(t,pick+2.65,.65)),kr(t,b+1.15,.45)*(1-kr(t,b+3.15,.65))));
   assert.equal(q.observation,ramp(t,a+2.6,.65)*(1-ramp(t,b+1.35,.3)));
   assert.equal(q.rules,ramp(t,a,.55));assert.equal(q.explanation,1-ramp(t,get(timeline,'s10_distinction').start-.3,.25));
   assert.deepEqual(p,{move:ramp(t,row+.1,1.2),rows:ramp(t,row+1.5,.45),names:ramp(t,row+1.35,.3),grid:ramp(t,row+1.5,.7),showExplanation:t>=row+1.5,cols:ramp(t,col,.65),explanation:1-ramp(t,get(timeline,'s23_score_order').start-.3,.25),oldExit:1-ramp(t,row-.45,.42)});
  }
 }
});
test('compression thresholds are continuous and degenerate clocks remain finite',()=>{
 for(const [id,budget,kind,field] of [['s20_definition',.5,'payoff','oldExit'],['s08_known_unknown',4.8,'info','move'],['s09_simultaneous',4.1,'info','reveal'],['s21_rows',2.5,'payoff','grid'],['s22_columns',1.1,'payoff','cols']]){
  const s=get(source,id),w=s.end-s.start;
  for(const f of [0,.25,.5,.75,.9,1]){
   const v=[-1e-7,0,1e-7].map(delta=>{const timeline=retime((budget+delta)/w),s=get(timeline,id);return state(s.start+(s.end-s.start)*f,timeline)[kind][field];});
   assert(Math.max(...v)-Math.min(...v)<1e-5,id);
  }
 }
 for(const width of [2**-45,0]){
  const timeline=structuredClone(source);
  for(const [i,s] of timeline.segments.entries()){s.start=128+i;s.end=s.start+width;}
  for(const s of timeline.segments)for(const t of [s.start-1,s.start,s.end,s.end+1])finite(state(t,timeline));
 }
});
for(const scale of [1,.3,1.3,1e-8])test(`${scale}x real scene records show reveal and row instructions before the next subtitle`,()=>{
 const url=p=>JSON.stringify(new URL(p,import.meta.url).href);
 const result=spawnSync(process.execPath,['--loader',new URL('./fixtures/tail-frame-recording-loader.mjs',import.meta.url).pathname,'--input-type=module','-e',`
  import assert from 'node:assert/strict';
  import {timeline,sceneData} from ${url('../production/src/model.mjs')};
  import {validateFirstEpisodeTimeline} from ${url('../scripts/validate-data.mjs')};
  import {calls,prepareAssets} from ${url('../production/src/primitives.mjs')};
  const scale=${scale};${retimeCode}
  await prepareAssets();const {drawFrame}=await import(${url('../production/src/scenes.mjs')});
  const context={save(){},restore(){},setTransform(){},fillRect(){}};
  const canvas={width:1920,height:1080,getContext(){return context;}};
  const get=id=>timeline.segments.find(s=>s.id===id);
  const render=t=>{drawFrame(canvas,t);return structuredClone(calls);};
  const s9=get('s09_simultaneous'),row=get('s21_rows'),col=get('s22_columns');
  const times=[s9.start+(s9.end-s9.start)*.8,row.start+(row.end-row.start)*.9,col.start+(col.end-col.start)*.7];
  const snapshots=times.map(render);
  const has=(i,label)=>snapshots[i].find(c=>c[0]==='text'&&c[1]===label&&c[4]===1);
  assert(has(0,'先各自选好'));assert(has(0,'再一起亮牌'));
  assert(has(1,'行'));assert(has(1,'先找{{A}}的行'));assert(has(2,'列'));assert(has(2,'再找{{B}}的列'));
  for(const i of [0,1,2])assert(snapshots[i].some(c=>c[0]==='text'&&c[1]===[s9,row,col][i].lines[0]&&c[4]>0));
  assert(snapshots[1].some(c=>c[0]==='line'&&c[1]===780&&c[2]===503&&c[3]===1740&&c.at(-1)===1),'The actual matrix grid is complete during rows');
  for(const i of [2,0,1,1,0,2])assert.deepEqual(render(times[i]),snapshots[i]);
  // Exercise actual scene dispatch and text/grid consumers at both boundaries
  // and quarter points, then revisit them in a different render order.
  for(const s of [get('s08_known_unknown'),s9,row,col]){
   const times=[-.001,0,.25,.5,.75,.999,1,1.001].map(p=>s.start+(s.end-s.start)*p);
   const snapshots=times.map(render);
   for(const i of [6,2,7,0,4,4,1,5,3])assert.deepEqual(render(times[i]),snapshots[i]);
  }
 `],{encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
