import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {withSourceFixture} from '../scripts/source-fixture.mjs';
import {pythonCommand} from '../scripts/python.mjs';

// Observe actual native pixel requests, independently of the QA batch counter.
// Reject an unbounded mutation on call 9, before it can accumulate full frames.
const probe=`
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {CanvasElement}=require('@napi-rs/canvas');
const original=CanvasElement.prototype.data;
let burst=0,maximum=0,calls=0;
CanvasElement.prototype.data=function(...args){
 if(burst===0)setImmediate(()=>{burst=0;});
 burst++;calls++;maximum=Math.max(maximum,burst);
 assert(burst<=8,'QA_SYNC_SNAPSHOT_LIMIT: yield after at most eight raw snapshots');
 return original.apply(this,args);
};
process.once('exit',code=>{if(code===0)console.log('QA_SNAPSHOTS '+JSON.stringify({calls,maximum}));});
`;

test('motion raster QA preserves every sample while bounding synchronous snapshots',()=>{
 withSourceFixture(root=>{
  const preload=path.join(root,'.motion-scheduling-probe.mjs');fs.writeFileSync(preload,probe);
  const run=()=>spawnSync(process.execPath,['--import','./scripts/isolated-fonts.mjs','--import',preload,'production/qa/motion-demo.mjs'],{cwd:root,encoding:'utf8',maxBuffer:1024*1024,env:{...process.env,PYTHON:pythonCommand()}});
  const passed=run();assert.equal(passed.status,0,passed.stdout+passed.stderr);
  const observation=JSON.parse(passed.stdout.match(/QA_SNAPSHOTS (.+)/)?.[1]??'null');
  assert.deepEqual(observation,{calls:170,maximum:8});
  const output=path.join(root,'artifacts/motion-demo'),report=JSON.parse(fs.readFileSync(path.join(output,'report.json'),'utf8'));
  assert.equal(report.scenes.length,2);assert.equal(report.scenes.reduce((total,scene)=>total+scene.frames.length,0),62);
  assert.equal(fs.readdirSync(output).filter(name=>name.endsWith('.png')).length,10);
  const script=path.join(root,'production/qa/motion-demo.mjs'),source=fs.readFileSync(script,'utf8');
  const unbounded=source.replace('if(drawsInBatch===8)','if(false)');assert.notEqual(unbounded,source,'The mutation must remove the active event-loop yield.');
  fs.writeFileSync(script,unbounded);
  const rejected=run();assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/QA_SYNC_SNAPSHOT_LIMIT/);
 });
});
