import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {verifyCaseDesignReport,verifyCaseCommand} from '../scripts/case-reuse-contract.mjs';
const read=file=>JSON.parse(fs.readFileSync(new URL(file,import.meta.url)));
const tokens=read('../design/tokens.json'),scene=read('../design/scenes.json');
// Independent fixture describes expected consumer checks, not an archived pass count.
function report(){
 const names=['Matrix payoff order A then B follows the current case','Default highlight follows the configured selection'];
 for(const id of ['editorial','textbook','bright']){
  for(const role of ['body ink/paper','secondary muted/paper','reverse badge paper/ink','card white/strategyRed','card white/strategyBlue'])names.push(`${id}: ${role} contrast ≥ 4.5`);
  if(id==='editorial')names.push(`${id}: annotation accent/paper contrast ≥ 4.5`,`${id}: selected score 66px bold accent/wash contrast ≥ 3`);
  else names.push(`${id}: selected score ink/wash contrast ≥ 4.5`);
  if(id==='bright')for(const role of ['callout ink/accent','result ink/lilac','stage ink/cream'])names.push(`${id}: ${role} contrast ≥ 4.5`);
  names.push(`${id}: board native dimensions`);
  for(const frame of ['participants','payoff'])for(const check of ['native 1080p','board is pixel-identical and uncropped','deterministic render','text stays in canvas','subtitle follows configured size'])names.push(`${id}/${frame}: ${check}`);
  for(let r=0;r<2;r++)for(let k=0;k<2;k++)names.push(`${id}: selection, highlight and explanation [${r},${k}]`);
 }
 return {failed:0,passed:names.length,results:names.map(name=>({name,ok:true}))};
}
test('changed-case report checks complete named coverage and accepts additional passing checks',()=>{
 const value=report();assert.equal(verifyCaseDesignReport(value,tokens,scene),value.results.length);
 value.results.push({name:'new independently useful check',ok:true});value.passed++;
 assert.equal(verifyCaseDesignReport(value,tokens,scene),value.results.length);
});
test('missing checks cannot hide behind zero failures or an updated passed total',()=>{
 const base=report();
 for(let index=0;index<base.results.length;index++){
  const value=structuredClone(base);value.results.splice(index,1);value.passed--;
  assert.throws(()=>verifyCaseDesignReport(value,tokens,scene),/Missing required design check/);
 }
});
test('failed rows, contradictory totals, duplicate names and missing rows are rejected',()=>{
 for(const mutate of [r=>r.results[0].ok=false,r=>r.results[0].ok='true',r=>r.failed=1,r=>r.passed=53,
  r=>{r.results.push({...r.results[0]});r.passed++;},r=>delete r.results]){
  const value=report();mutate(value);assert.throws(()=>verifyCaseDesignReport(value,tokens,scene));
 }
});
test('failed real child output retains its exact complete ending outside the short error',()=>{
 const script=`process.stdout.write('START\\n'+'a'.repeat(30000)+'\\nCORE-END: failing test detail\\n');process.stderr.write('STDERR-END: diagnostic\\n');process.exit(7)`;
 const result=spawnSync(process.execPath,['-e',script],{encoding:'utf8'}),writes={stdout:'',stderr:''};
 const sink=Object.fromEntries(Object.keys(writes).map(key=>[key,{write(value){writes[key]+=value;}}]));
 assert.throws(()=>verifyCaseCommand('test:core',result,sink),error=>{
  assert.match(error.message,/test:core: status=7, signal=none/);assert.ok(error.message.length<200);return true;
 });
 assert.equal(writes.stdout,result.stdout);assert.equal(writes.stderr,result.stderr);
 assert.ok(writes.stdout.endsWith('CORE-END: failing test detail\n'));assert.ok(writes.stderr.endsWith('STDERR-END: diagnostic\n'));
});
test('success stays quiet and signals/spawn errors are diagnosed',()=>{
 const sink={write(){assert.fail('Successful child output should remain quiet');}};
 verifyCaseCommand('ok',{status:0,signal:null,stdout:'normal output',stderr:'normal warning'},{stdout:sink,stderr:sink});
 for(const result of [{status:null,signal:'SIGTERM'},{status:null,error:{code:'ENOENT'}},{status:0,error:{code:'ENOBUFS'}}])
  assert.throws(()=>verifyCaseCommand('test:core',result),/Changed supported case failed test:core/);
});
test('actual reuse wrapper runs every real command name and reports checked count with complete failure diagnostics',async()=>{
 const os=await import('node:os'),path=await import('node:path');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'case-reuse-wrapper-'));
 try{
  const write=(file,value)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),typeof value==='string'?value:JSON.stringify(value));};
  write('.git/info/exclude','');write('design/scenes.json',scene);write('design/tokens.json',tokens);write('design/qa/checks.json',report());
  write('chapters/01-four-elements/narration/timeline.json',{speech_guidance:{}});
  write('chapters/01-four-elements/narration/voiceover_v2_zh.txt','明月得三十一分，青禾得三十二分。');
  const childStub=`import fs from 'node:fs';export const spawnSync=(exe,args)=>{if(args[0]==='run'){fs.appendFileSync(process.env.CASE_FIXTURE_ROOT+'/commands',args[1]+'\\n');if(args[1]===process.env.CASE_FIXTURE_FAIL)return {status:7,signal:null,stdout:'WRAPPER-START\\n'+'x'.repeat(30000)+${JSON.stringify('\nWRAPPER-STDOUT-END\n')},stderr:${JSON.stringify('WRAPPER-STDERR-END\n')}};}return {status:0,signal:null,stdout:'quiet success output',stderr:''};};`;
  write('loader.mjs',`const source=text=>({format:'module',source:text,shortCircuit:true});export async function resolve(specifier,context,next){if(specifier==='node:child_process')return {url:'fixture:child',shortCircuit:true};return next(specifier,context);}export async function load(url,context,next){if(url==='fixture:child')return source(${JSON.stringify(childStub)});if(url.endsWith('/scripts/source-fixture.mjs'))return source('export const withSourceFixture=callback=>callback(process.env.CASE_FIXTURE_ROOT);');if(url.endsWith('/scripts/python.mjs'))return source('export const pythonCommand=()=>"python";');return next(url,context);}`);
  const run=fail=>spawnSync(process.execPath,['--loader',path.join(root,'loader.mjs'),new URL('../scripts/case-reuse-smoke.mjs',import.meta.url).pathname],{encoding:'utf8',env:{...process.env,CASE_FIXTURE_ROOT:root,CASE_FIXTURE_FAIL:fail}});
  const success=run('');assert.equal(success.status,0,success.stderr);
  assert.match(success.stdout,new RegExp(`all ${report().results.length} design checks`));assert.ok(!success.stdout.includes('quiet success output'));
  assert.deepEqual(fs.readFileSync(path.join(root,'commands'),'utf8').trim().split('\n'),['build:narration','build:editorial','qa:data','qa:editorial','test:core','render:proposals','qa:design','qa:layout','qa:cast']);
  const failure=run('test:core');assert.notEqual(failure.status,0);assert.equal(failure.stdout,'WRAPPER-START\n'+'x'.repeat(30000)+'\nWRAPPER-STDOUT-END\n');
  assert.match(failure.stderr,/WRAPPER-STDERR-END/);assert.match(failure.stderr,/test:core: status=7, signal=none/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
