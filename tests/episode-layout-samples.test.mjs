import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pythonCommand} from '../scripts/python.mjs';
import assert from 'node:assert/strict';
import {timeline} from '../production/src/model.mjs';
import {comparisonState} from '../production/src/comparison-timing.mjs';
import {createLayoutSamples} from '../production/qa/layout-samples.mjs';
import {beforeEnd} from '../production/src/frame-time.mjs';

function checkCoverage(timing,sampling){
 const {times,intervals,fps}=sampling;
 assert(times.every(t=>t>=0&&t<timing.duration));
 for(const window of [...timing.segments,...intervals]){
  const start=Math.max(0,window.start),end=Math.min(timing.duration,window.end);
  if(end<=start)continue;
  const inside=times.filter(t=>t>=start&&t<=end);
  assert(inside.length,`No samples for ${window.id}`);
  for(let i=1;i<inside.length;i++)assert(inside[i]-inside[i-1]<=.100000000001,`Dense coverage gap: ${window.id}`);
  for(const fraction of [0,.25,.5,.75,1])for(const d of [-1/fps,0,1/fps]){
   const t=start+(end-start)*fraction+d;
   if(t>=0&&t<timing.duration)assert(times.includes(t),`Missing ${window.id} ${fraction} adjacent ${d}`);
  }
 }
}
for(const scale of [1,.07,2.4])test(`layout covers full live windows and comparison movement at scale ${scale}`,()=>{
 const timing=structuredClone(timeline);
 timing.duration*=scale;
 for(const collection of [timing.segments,timing.sections])for(const s of collection){s.start*=scale;s.end*=scale;}
 for(const s of timing.segments)for(const r of s.visual_cue.score_reveals??[])r.offset*=scale;
 const sampling=createLayoutSamples(timing);checkCoverage(timing,sampling);
 // Independent observations of the real renderer state: both late branches
 // must have multiple intermediate opacity/position states in the QA samples.
 for(const key of ['red','blue']){
  const values=sampling.times.map(t=>comparisonState(t,timing)[key]).filter(p=>p>0&&p<1);
  assert(new Set(values).size>=3,`${key} has no real intermediate movement coverage`);
  for(const q of [.25,.5,.75]){
   const expected=q*q*q*(q*(q*6-15)+10);
   assert(values.some(v=>Math.abs(v-expected)<1e-9),`${key} lacks actual ${q} motion state`);
  }
 }
});
test('old boundary-only schedule fails the real late-branch coverage requirement',()=>{
 const old=new Set();for(let t=0;t<timeline.duration;t+=.5)old.add(+t.toFixed(3));
 for(const s of timeline.segments)for(let d=-.45;d<1.7;d+=.1)old.add(+(s.start+d).toFixed(3));
 for(const key of ['red','blue']){
  const values=[...old].map(t=>comparisonState(t,timeline)[key]).filter(p=>p>0&&p<1);
  assert(new Set(values).size<3,`Negative control unexpectedly covers ${key}`);
 }
 assert.throws(()=>checkCoverage(timeline,{...createLayoutSamples(timeline),times:[...old].sort((a,b)=>a-b)}));
});
test('exclusive timeline end and tiny final window remain representable',()=>{
 const timing=structuredClone(timeline),last=timing.segments.at(-1);
 last.start=beforeEnd(last.end);timing.segments.at(-2).end=last.start;
 const {times}=createLayoutSamples(timing);
 assert(times.includes(last.start));assert(!times.includes(timing.duration));
 assert.equal(times.at(-1),beforeEnd(timing.duration));
});

test('lightweight runner aggregates every sample from multiple bounded renderer processes',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'layout-runner-test-'));
 try{
  const output=path.join(directory,'report.json');
  const result=spawnSync(process.execPath,['--loader',new URL('./fixtures/episode-alpha-stubs-loader.mjs',import.meta.url).pathname,new URL('../production/qa/layout-runner.mjs',import.meta.url).pathname,'--placeholder-cast'],{encoding:'utf8',env:{...process.env,PYTHON:pythonCommand(),EPISODE_ALPHA_FIXTURE:'clear',EPISODE_ALPHA_DURATION:'12',EPISODE_LAYOUT_REPORT:output}});
  assert.equal(result.status,0,result.stdout+result.stderr);
  const expected=createLayoutSamples({duration:12,segments:[],sections:[]}).times.length;
  assert(expected>100);
  assert.equal((result.stdout.match(/ALPHA_ROUTE/g)??[]).length,Math.ceil(expected/100));
  const report=JSON.parse(fs.readFileSync(output,'utf8'));
  assert.equal(report.samples,expected);assert.equal(report.text_draws,expected);
  assert.equal(report.status,'passed');assert.equal(report.issues.length,0);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
