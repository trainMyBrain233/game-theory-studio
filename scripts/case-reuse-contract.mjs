import assert from 'node:assert/strict';
import {proposalTextPairs} from '../design/text-contrast.mjs';

/** Check coverage as well as success; additional valid checks may be added freely. */
export function verifyCaseDesignReport(report,tokens,scene){
 assert.ok(Array.isArray(report.results),'Design QA must include individual results');
 assert.equal(report.failed,0,'Changed-case design QA must have no failures');
 const names=new Set();
 for(const result of report.results){
  assert.equal(typeof result.name,'string','Design checks need names');
  assert.ok(!names.has(result.name),`Duplicate design check: ${result.name}`);names.add(result.name);
  assert.equal(result.ok,true,`Failed design check: ${result.name}`);
 }
 assert.equal(report.passed,report.results.length,'Design passed count must match individual results');
 const required=['Matrix payoff order A then B follows the current case','Default highlight follows the configured selection'];
 for(const id of Object.keys(tokens.styles)){
  required.push(`${id}: board native dimensions`);
  for(const pair of proposalTextPairs(tokens,id))required.push(`${id}: ${pair.role} contrast ≥ ${pair.minimum}`);
  for(const frame of scene.frames)for(const check of ['native 1080p','board is pixel-identical and uncropped','deterministic render','text stays in canvas','subtitle follows configured size'])required.push(`${id}/${frame.id}: ${check}`);
  for(let r=0;r<2;r++)for(let k=0;k<2;k++)required.push(`${id}: selection, highlight and explanation [${r},${k}]`);
 }
 for(const name of required)assert.ok(names.has(name),`Missing required design check: ${name}`);
 return report.results.length;
}

/** Keep child diagnostics intact; AssertionError formatting truncates long output. */
export function verifyCaseCommand(command,result,{stdout=process.stdout,stderr=process.stderr}={}){
 if(result.status===0&&!result.signal&&!result.error)return;
 if(result.stdout)stdout.write(result.stdout);
 if(result.stderr)stderr.write(result.stderr);
 throw Error(`Changed supported case failed ${command}: status=${result.status}, signal=${result.signal??'none'}${result.error?`, error=${result.error.code??result.error.message}`:''}`);
}
