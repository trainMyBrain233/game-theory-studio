// Exercise the actual mutation runner and interpreter selection without loading
// Canvas/FontTools. Unexpected subprocesses fail rather than escaping the stub.
export async function load(url,context,nextLoad) {
 if(url.endsWith('/scripts/source-fixture.mjs'))return {format:'module',shortCircuit:true,
  source:'export const withSourceFixture=callback=>callback(process.cwd());'};
 if(url==='node:child_process')return {format:'module',shortCircuit:true,source:`
import assert from 'node:assert/strict';
import fs from 'node:fs';
export function spawnSync(command,args,options) {
 assert.equal(options.env?.PYTHON,process.env.FONT_MUTATION_EXPECTED_PYTHON,'Every mutation child must inherit the selected project interpreter');
 fs.appendFileSync(process.env.FONT_MUTATION_SPAWN_LOG,JSON.stringify({command,args,python:options.env.PYTHON})+'\\n');
 if(command!==process.execPath) {
  assert(['npm','npm.cmd'].includes(command));assert.deepEqual(args,['test']);
  return {status:1,stdout:'',stderr:'Applied canvas font weight must be 700'};
 }
 assert(args.at(-1).endsWith('/typography/qa-fonts.mjs'));
 const source=fs.readFileSync('typography/fonts.mjs','utf8');
 const reason=source.includes('return '+String.fromCharCode(96)+'400 ')?'Applied canvas font weight must be 700':
  source.includes(' 8px ')?'Applied canvas font size must be 34px':'Applied canvas font family must be GameTheory Noto Serif SC';
 return {status:1,stdout:'',stderr:reason};
}`};
 return nextLoad(url,context);
}
