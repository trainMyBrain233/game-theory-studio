import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const root=new URL('../',import.meta.url);

test('layout QA checks all four clearance contracts for every nonzero text alpha',()=>{
 for(const alpha of [.12,.02,.001,Number.EPSILON,0]){
  const result=spawnSync(process.execPath,['--loader','./tests/fixtures/fading-text-qa-loader.mjs','production/qa/validate.mjs','--actor-alpha'],{cwd:root,encoding:'utf8',env:{...process.env,FADING_TEXT_ALPHA:String(alpha)}});
  assert.equal(result.status,alpha===0?0:1,result.stderr+result.stdout);
  const report=JSON.parse(result.stdout);
  const kinds=new Set(report.issues.map(issue=>issue.kind));
  for(const kind of ['safe_bounds','text_overlap','line_text_clearance','actor_text_clearance'])assert.equal(kinds.has(kind),alpha>0,`${kind} at alpha ${alpha}`);
 }
});

test('actual drawing primitives record the applied nested alpha, including faint text and lines',()=>{
 const source=`
 import assert from 'node:assert/strict';
 import {tx,line,group,records,routes,resetRecords} from './production/src/primitives.mjs';
 const stack=[];const c={canvas:{width:1920},globalAlpha:1,save(){stack.push({alpha:this.globalAlpha});},restore(){this.globalAlpha=stack.pop().alpha;},
 translate(){},getTransform(){return {a:1,b:0,c:0,d:1,e:0,f:0};},measureText(){return {width:60,actualBoundingBoxLeft:0,actualBoundingBoxRight:60,actualBoundingBoxAscent:28,actualBoundingBoxDescent:8};},fillText(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}};
 for(const alpha of [.12,.02,.001,Number.EPSILON,0]){
  resetRecords();c.globalAlpha=.5;
  group(c,.5,0,0,()=>group(c,alpha,0,0,()=>{tx(c,'fixture',100,100);line(c,0,0,100,100);}));
  assert.equal(records.length,alpha>0?1:0);assert.equal(routes.length,alpha>0?1:0);
  if(alpha>0){assert.equal(records[0].alpha,.25*alpha);assert.equal(routes[0].alpha,.25*alpha);}
  assert.equal(c.globalAlpha,.5);
 }
 resetRecords();c.globalAlpha=0;tx(c,'transparent',100,100);line(c,0,0,100,100);
 assert.equal(records.length,0);assert.equal(routes.length,0);
 `;
 const result=spawnSync(process.execPath,['--loader','./tests/fixtures/proposal-header-stubs-loader.mjs','--input-type=module','--eval',source],{cwd:root,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr+result.stdout);
});
