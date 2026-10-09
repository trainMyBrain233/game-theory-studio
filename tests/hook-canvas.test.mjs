import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {ramp} from '../production/src/motion.mjs';
import {pythonCommand} from '../scripts/python.mjs';
const file=p=>new URL(p,import.meta.url).pathname;
function frames(scale,fractions,legacy=false){
 const args=['--import',file('../scripts/isolated-fonts.mjs')];
 if(legacy)args.push('--loader',file('./fixtures/hook-legacy-loader.mjs'));
 args.push(file('./fixtures/hook-native-frame.mjs'));
 const p=spawnSync(process.execPath,args,{encoding:'utf8',timeout:60000,env:{...process.env,PYTHON:pythonCommand(),HOOK_SCALE:String(scale),HOOK_FRACTIONS:JSON.stringify(fractions)}});
 assert.equal(p.status,0,p.stdout+p.stderr+(p.error??''));return JSON.parse(p.stdout.trim().split('\n').at(-1));
}
test('native compressed and tiny hooks show fully opaque question and both complete arrow pixel regions',()=>{
 for(const scale of [.3,1e-8]){
  const rendered=frames(scale,[.875,.45,.94,.99,.875]);
  const [fixed]=rendered;assert.deepEqual(fixed.alpha,[1,1,1]);assert.deepEqual(fixed.pixelsMatch,[true,true,true,true,true]);
  // Native Canvas quantizes globalAlpha to an 8-bit channel; require the
  // composed value within one channel step, with the settled hold exact.
  for(const frame of rendered){const expected=ramp(frame.fraction*3.6,1.4,.55)*(1-ramp(frame.fraction*3.6,3.28,.27));for(const alpha of frame.alpha)assert(Math.abs(alpha-expected)<1/255+1e-12);}
  assert.equal(rendered[0].hash,rendered.at(-1).hash,'order-independent identical native frame');
 }
 const [broken]=frames(.3,[.875],true);assert(broken.alpha.some(a=>a<1));assert.deepEqual(broken.pixelsMatch.slice(3),[false,false]);
});
test('default and extended entrance, hold and exit native pixels equal legacy frames',()=>{
 for(const scale of [1,1.3]){
  const fractions=[.1,.25,.4,.55,.875,.965,.99,1];
  const current=frames(scale,fractions),old=frames(scale,fractions,true);
  assert.deepEqual(current.map(f=>f.hash),old.map(f=>f.hash));
 }
});
