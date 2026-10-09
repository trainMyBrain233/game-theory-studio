import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import {spawnSync} from 'node:child_process';

const scenes=new URL('../production/src/scenes.mjs',import.meta.url).href;
const primitives=new URL('../production/src/primitives.mjs',import.meta.url).href;
function run(source){
 const result=spawnSync(process.execPath,['--loader',new URL('./fixtures/frame-time-stubs-loader.mjs',import.meta.url).pathname,'--input-type=module','-e',`import {prepareAssets} from ${JSON.stringify(primitives)}; await prepareAssets();\n${source}`],{cwd:os.tmpdir(),encoding:'utf8',timeout:30000});
 assert.equal(result.status,0,result.stdout+result.stderr);
}

test('direct drawFrame rejects stretched and invalid canvases before changing render state',()=>run(`
 import assert from 'node:assert/strict';
 import {drawFrame} from ${JSON.stringify(scenes)};
 import {calls} from ${JSON.stringify(primitives)};
 for(const [width,height] of [[1280,1080],[1080,1080],[3840,1080],[1920,1000],[0,0],[-1920,-1080],[NaN,1080],[1920,Infinity],[19.2,10.8],['1920',1080],[1920,undefined],[Number.MAX_SAFE_INTEGER+1,1080]]){
  calls.length=0;
  const canvas={width,height,getContext(){calls.push(['getContext']);throw Error('Unexpected drawing context');}};
  assert.throws(()=>drawFrame(canvas,12.5),/16:9/);
  assert.deepEqual(calls,[],'Invalid geometry cannot reset records, change actor time or get a drawing context.');
 }
`));

test('direct drawFrame retains finite-time validation, clamping and uniform valid-canvas transforms',()=>run(`
 import assert from 'node:assert/strict';
 import {drawFrame,DURATION,W,H} from ${JSON.stringify(scenes)};
 import {calls} from ${JSON.stringify(primitives)};
 for(const time of [NaN,Infinity,-Infinity,undefined,null,'1',true,{}]){
  calls.length=0;
  const canvas={get width(){throw Error('Geometry read before rejecting time');},getContext(){throw Error('Unexpected drawing context');}};
  assert.throws(()=>drawFrame(canvas,time),/Frame time must be a finite number/);
  assert.deepEqual(calls,[]);
 }
 const bits=new DataView(new ArrayBuffer(8));bits.setFloat64(0,DURATION);bits.setBigUint64(0,bits.getBigUint64(0)-1n);const lastTime=bits.getFloat64(0);
 for(const [width,height] of [[1920,1080],[3840,2160],[960,540],[1280,720]]){
  for(const [time,expected] of [[-1,0],[0,0],[12.5,12.5],[DURATION-1/30,DURATION-1/30],[DURATION,lastTime],[Number.MAX_VALUE,lastTime],[-Number.MAX_VALUE,0]]){
   calls.length=0;
   const context={save(){calls.push(['save']);},setTransform(...args){calls.push(['setTransform',...args]);},fillRect(...args){calls.push(['fillRect',...args]);}};
   const canvas={width,height,getContext(kind){calls.push(['getContext',kind]);return context;}};
   assert.throws(()=>drawFrame(canvas,time),/Unexpected drawing boundary/);
   const scale=width/W;
   assert.equal(scale,height/H);
   assert.deepEqual(calls,[['resetRecords'],['setSceneTime',expected],['getContext','2d'],['save'],['setTransform',scale,0,0,scale,0,0],['fillRect',0,0,W,H]]);
  }
 }
`));
