import '../scripts/isolated-fonts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {withSourceFixture} from '../scripts/source-fixture.mjs';
import {pythonCommand} from '../scripts/python.mjs';
import {createRenderSession} from '../production/src/animatic/render-frame.mjs';

const fixture=()=>JSON.parse(fs.readFileSync(new URL('./fixtures/animatic/minimal-plan.json',import.meta.url),'utf8'));
const bounds={x:12,y:12,width:16,height:20};
const resizeError=/Avatar provider draw must preserve declared canvas dimensions/;
// Original geometric ink stays inside every tested size, so alpha validation
// cannot accidentally mask a missing capture-dimension check.
function cast(change=()=>{}) {
 return Object.fromEntries(['A','B'].map(id=>[id,{
  id,width:96,height:112,alphaBounds:{...bounds},
  draw(ctx){change(ctx,this);ctx.fillStyle='#243E66';ctx.fillRect(bounds.x,bounds.y,bounds.width,bounds.height);}
 }]));
}

test('unchanged provider dimensions preserve real mirrored pixels and deterministic identity',()=>{
 const retained=[],adapters=cast(ctx=>retained.push(ctx));
 const session=createRenderSession({plan:fixture(),adapters}),same=createRenderSession({plan:fixture(),adapters:cast()});
 assert.equal(session.fingerprint,same.fingerprint);
 assert.deepEqual(session.renderPNG(50),same.renderPNG(50));
 const rendered=session.render(50);
 try{
  assert.deepEqual(rendered.avatarRecords[1].bounds,{x:1024.4,y:239.6,width:12.8,height:16});
  const ctx=rendered.avatarMask.getContext('2d');
  assert.equal(ctx.getImageData(1030,245,1,1).data[3],255,'Mirrored ink uses the declared 96px footprint');
  assert.equal(ctx.getImageData(1107,245,1,1).data[3],0,'No ink appears at the old widened-provider position');
 }finally{rendered.dispose();}
 for(const ctx of retained)assert.deepEqual([ctx.canvas.width,ctx.canvas.height],[1,1]);
});

for(const [label,width,height] of [
 ['wider',192,112],['taller',96,160],['narrower',48,112],['shorter',96,64],
 ['over-width-cap',4097,32],['over-height-cap',32,4097]
])test(`provider ${label} surface is rejected even with unchanged alpha bounds`,()=>{
 let exposed;
 const adapters=cast((ctx,adapter)=>{
  if(adapter.id!=='A')return;
  exposed=ctx.canvas;exposed.width=width;exposed.height=height;
 });
 assert.throws(()=>createRenderSession({plan:fixture(),adapters}),resizeError);
 assert.deepEqual([exposed.width,exposed.height],[1,1],'Rejected provider surface must release its backing memory');
});

test('provider cannot conceal a resize by changing its declared dimensions during draw',()=>{
 let exposed;
 const adapters=cast((ctx,adapter)=>{
  if(adapter.id!=='A')return;
  exposed=ctx.canvas;adapter.width=exposed.width=192;adapter.height=exposed.height=160;
 });
 assert.throws(()=>createRenderSession({plan:fixture(),adapters}),resizeError);
 assert.deepEqual([exposed.width,exposed.height],[1,1]);
});

test('declaration mutation alone cannot change captured dimensions, identity or private pixels',()=>{
 let retained;
 const baseline=createRenderSession({plan:fixture(),adapters:cast()});
 const adapters=cast((ctx,adapter)=>{retained=ctx;adapter.width=4097;adapter.height=32;});
 const session=createRenderSession({plan:fixture(),adapters}),expected=baseline.renderPNG(50);
 assert.equal(session.fingerprint,baseline.fingerprint);
 assert.deepEqual(session.renderPNG(50),expected);
 retained.canvas.width=96;retained.canvas.height=112;
 retained.fillStyle='magenta';retained.fillRect(0,0,96,112);
 assert.deepEqual(session.renderPNG(50),expected,'A retained exposed canvas must not be the private session asset');
 retained.canvas.width=1;retained.canvas.height=1;
});

test('a throwing provider releases its exposed capture surface',()=>{
 let exposed;
 const adapters=cast(ctx=>{exposed=ctx.canvas;exposed.width=4097;exposed.height=32;throw new Error('provider draw failed');});
 assert.throws(()=>createRenderSession({plan:fixture(),adapters}),/provider draw failed/);
 assert.deepEqual([exposed.width,exposed.height],[1,1]);
});

test('real capture rejects resize before private allocation or pixel reads and uses only saved dimensions',()=>{
 // A source fixture instruments the real canvas boundary, without replacing
 // the compositor, native surfaces, font checks or provider callback path.
 const python=spawnSync(pythonCommand(),['-c','import sys; print(sys.executable)'],{encoding:'utf8'});
 assert.equal(python.status,0,python.stderr);
 const projectPython=python.stdout.trim();assert(path.isAbsolute(projectPython));
 withSourceFixture(root=>{
  const filename=path.join(root,'production/src/animatic/render-frame.mjs'),source=fs.readFileSync(filename,'utf8');
  const anchor="import {createCanvas} from '@napi-rs/canvas';";
  assert(source.includes(anchor),'Canvas instrumentation anchor must exist');
  fs.writeFileSync(filename,source.replace(anchor,`import {createCanvas as nativeCreateCanvas} from '@napi-rs/canvas';
export const captureAllocations=[],captureReads=[];
function createCanvas(width,height){
 captureAllocations.push([width,height]);
 const canvas=nativeCreateCanvas(width,height),ctx=canvas.getContext('2d'),read=ctx.getImageData.bind(ctx);
 ctx.getImageData=(...args)=>{captureReads.push(args);return read(...args);};
 return canvas;
}`));
  const code=`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRenderSession,captureAllocations,captureReads} from './production/src/animatic/render-frame.mjs';
const plan=JSON.parse(fs.readFileSync('tests/fixtures/animatic/minimal-plan.json'));
const make=change=>Object.fromEntries(['A','B'].map(id=>[id,{id,width:96,height:112,alphaBounds:{x:12,y:12,width:16,height:20},draw(ctx){change(ctx,this);ctx.fillRect(12,12,16,20);}}]));
for(const [width,height] of [[192,112],[96,160],[48,64],[4097,32],[32,4097]]){
 captureAllocations.length=captureReads.length=0;
 const adapters=make(ctx=>{ctx.canvas.width=width;ctx.canvas.height=height;});
 assert.throws(()=>createRenderSession({plan,adapters}),${resizeError});
 assert.deepEqual(captureAllocations,[[96,112]],'Resize must fail before allocating any private surface');
 assert.deepEqual(captureReads,[],'Resize must fail before reading provider pixels');
}
for(const [width,height] of [[4097,32],[32,4097]]){
 captureAllocations.length=captureReads.length=0;
 const adapters=make(()=>assert.fail('Oversized declarations must never invoke providers'));
 Object.assign(adapters.A,{width,height});
 assert.throws(()=>createRenderSession({plan,adapters}),/native dimensions exceed/);
 assert.deepEqual(captureAllocations,[]);assert.deepEqual(captureReads,[]);
}
captureAllocations.length=captureReads.length=0;
createRenderSession({plan,adapters:make((ctx,adapter)=>{adapter.width=4097;adapter.height=32;})});
assert.deepEqual(captureAllocations,[[96,112],[96,112],[96,112],[96,112]]);
assert.equal(captureReads.length,6);
assert(captureReads.every(args=>JSON.stringify(args)==='[0,0,96,112]'),'Every source/private read must use the pre-draw declared dimensions');
`;
  const result=spawnSync(process.execPath,['--import','./scripts/isolated-fonts.mjs','--input-type=module','-e',code],{
   cwd:root,encoding:'utf8',maxBuffer:4*1024*1024,env:{...process.env,PYTHON:projectPython}
  });
  assert.equal(result.status,0,result.stdout+result.stderr);
 });
});
