import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {withSourceFixture} from '../scripts/source-fixture.mjs';
import {pythonCommand} from '../scripts/python.mjs';
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
  cwd:root,encoding:'utf8',env:{...process.env,PYTHON:pythonCommand(),NODE_OPTIONS:`--loader=${loader}`,EPISODE_ALPHA_FIXTURE:mode},
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

test('layout switches are boolean and reject unknown or positional arguments',()=>{
 for(const args of [['--actor-alhpa'],['--actor-alpha=true'],['--actor-alpha','false'],['--times'],['--times','0'],['unexpected'],['--']]){
  assert.throws(()=>layoutMode(args),/Unknown layout argument/);
 }
 for(const cast of [[],['--actor-alpha'],['--placeholder-cast']])for(const options of [[],['--stress-cast'],['--all-frames'],['--stress-cast','--all-frames']]){
  assert.deepEqual(layoutMode([...cast,...options]),{actorAlpha:cast.includes('--actor-alpha'),placeholder:!cast.includes('--actor-alpha')});
 }
});

test('npm, runner and validator reject bad layout arguments before assets without replacing reports',()=>withSourceFixture(root=>{
 const loader=pathToFileURL(path.join(root,'tests/fixtures/episode-alpha-stubs-loader.mjs')).href;
 const report=path.join(root,'layout-report-sentinel.json'),original='previous successful layout report\n';
 const reports=[report,...['checks.json','checks_long_names.json'].map(name=>path.join(root,'production/qa',name))];
 for(const file of reports)fs.writeFileSync(file,original);
 const run=(entry,args,extra={})=>spawnSync(entry==='npm'?(process.platform==='win32'?'npm.cmd':'npm'):process.execPath,entry==='npm'?['run','qa:episode:layout','--',...args]:[`production/qa/${entry}.mjs`,...args],{
  cwd:root,encoding:'utf8',env:{...process.env,PYTHON:pythonCommand(),NODE_OPTIONS:`--loader=${loader}`,EPISODE_ALPHA_FIXTURE:'asset-error',EPISODE_LAYOUT_REPORT:report,...extra},
 });
 for(const entry of ['npm','layout-runner','validate'])for(const args of [
  ['--actor-alhpa'],['--actor-alpha','--all-frame'],['--actor-alpha='],['--actor-alpha','false'],['--times'],['--times','0'],['unexpected'],['--all-frames','unexpected'],['--stress-cast','--unknown'],['--actor-alpha','--placeholder-cast'],
 ]){
  const result=run(entry,args),output=result.stdout+result.stderr;
  assert.notEqual(result.status,0,`${entry} ${args}: ${output}`);
  assert.match(output,args.includes('--placeholder-cast')?/conflicts with --placeholder-cast/:/Unknown layout argument/);
  assert.doesNotMatch(output,/ALPHA_ROUTE|Synthetic asset decode failure|"status": "passed"/);
  for(const file of reports)assert.equal(fs.readFileSync(file,'utf8'),original);
 }
 // Exercise the actual npm -> production -> runner -> validator passthrough.
 // Every supported combination reaches assets with its exact switch sequence.
 for(const cast of [[],['--actor-alpha'],['--placeholder-cast']])for(const options of [[],['--stress-cast'],['--all-frames'],['--all-frames','--stress-cast']]){
  const args=[...cast,...options],result=run('npm',args,{EPISODE_ALPHA_FIXTURE:'clear'}),output=result.stdout+result.stderr;
  assert.equal(result.status,0,output);
  const forwarded=JSON.parse(result.stdout.match(/ALPHA_ROUTE (\[[^\n]*\])/)[1]);
  assert.deepEqual(forwarded,cast.length?args:[...args,'--placeholder-cast']);
  const audit=JSON.parse(fs.readFileSync(report,'utf8')).actor_alpha;
  assert.equal(audit.mode,cast.includes('--actor-alpha')?'private_actor_alpha':'public_placeholder');
  if(cast.includes('--actor-alpha')){assert(audit.nonempty_mask_samples>0);assert(audit.clearance_checks>0);}
 }
}));
