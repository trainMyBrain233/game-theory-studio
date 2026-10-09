import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {withSourceFixture} from '../scripts/source-fixture.mjs';
import {layoutMode,createActorAlphaAudit,expectsActorPixels} from '../production/qa/layout-mode.mjs';

test('layout mode rejects contradictory flags and alpha audit refuses missing evidence',()=>{
 assert.deepEqual(layoutMode([]),{actorAlpha:false,placeholder:true});
 assert.deepEqual(layoutMode(['--actor-alpha']),{actorAlpha:true,placeholder:false});
 assert.throws(()=>layoutMode(['--actor-alpha','--placeholder-cast']),/conflicts/);
 const audit=createActorAlphaAudit({required:true,width:2,height:2});
 assert.throws(()=>audit.inspect(null),/requires a real/);
 assert.throws(()=>audit.finish(),/did not perform/);
 const empty={width:2,height:2,getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray(16)})})};
 assert.throws(()=>audit.inspect(empty,{expected:true,t:12}),/expected visible artwork at t=12/);
 for(const id of ['intro','players','information','strategy'])assert.equal(expectsActorPixels(5,{sections:[{id,start:0,end:10}]}),true);
 for(const id of ['payoffs','recap'])assert.equal(expectsActorPixels(5,{sections:[{id,start:0,end:10}]}),false);
 assert.equal(expectsActorPixels(.2,{sections:[{id:'intro',start:0,end:10}]}),false);
});

test('actual npm layout entry forwards alpha without placeholder and fails closed',()=>withSourceFixture(root=>{
 const loader=pathToFileURL(path.join(root,'tests/fixtures/episode-alpha-stubs-loader.mjs')).href;
 const run=(args=[],mode='clear',direct=false)=>spawnSync(direct?process.execPath:(process.platform==='win32'?'npm.cmd':'npm'),direct?['production/qa/validate.mjs',...args]:['run','qa:episode:layout','--',...args],{
  cwd:root,encoding:'utf8',env:{...process.env,NODE_OPTIONS:`--loader=${loader}`,EPISODE_ALPHA_FIXTURE:mode},
 });
 const output=r=>r.stdout+r.stderr;
 const publicRun=run();assert.equal(publicRun.status,0,output(publicRun));
 assert.match(publicRun.stdout,/ALPHA_ROUTE \[.*"--placeholder-cast"/);
 assert.match(publicRun.stdout,/"mode": "public_placeholder"/);
 assert.match(publicRun.stdout,/"clearance_checks": 0/);
 const privateRun=run(['--actor-alpha']);assert.equal(privateRun.status,0,output(privateRun));
 assert.match(privateRun.stdout,/ALPHA_ROUTE \[.*"--actor-alpha"/);
 assert.doesNotMatch(privateRun.stdout,/ALPHA_ROUTE .*--placeholder-cast/);
 assert.match(privateRun.stdout,/"nonempty_mask_samples": 1/);
 assert.match(privateRun.stdout,/"clearance_checks": 1/);
 for(const direct of [false,true]){
  const conflict=run(['--actor-alpha','--placeholder-cast'],'clear',direct);
  assert.notEqual(conflict.status,0);assert.match(output(conflict),/conflicts with --placeholder-cast/);
  assert.doesNotMatch(conflict.stdout,/ALPHA_ROUTE/);
 }
 for(const [mode,expected] of [['regional-empty',/expected visible artwork at t=/],['missing',/requires a real canvas-sized RGBA mask/],['empty',/did not perform/],['no-text',/did not perform/],['asset-error',/Synthetic asset decode failure/],['collision',/actor_text_clearance/]]){
  const result=run(['--actor-alpha'],mode);assert.notEqual(result.status,0,`${mode}: ${output(result)}`);
  assert.match(output(result),expected);assert.doesNotMatch(result.stdout,/"status": "passed"/);
 }
}));
