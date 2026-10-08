import '../scripts/isolated-fonts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRenderSession,PUBLIC_AVATAR_TRACKS} from '../production/src/animatic/render-frame.mjs';
import {createRasterCache} from '../production/src/animatic/raster-cache.mjs';
import {withSourceFixture} from '../scripts/source-fixture.mjs';
import {pythonCommand} from '../scripts/python.mjs';
import {syntheticCast} from './fixtures/animatic/synthetic-cast.mjs';
const fixture=()=>JSON.parse(fs.readFileSync(new URL('./fixtures/animatic/minimal-plan.json',import.meta.url),'utf8'));
const tracks=()=>structuredClone(PUBLIC_AVATAR_TRACKS);
const clipping=/Avatar [AB] filtered alpha footprint must remain inside/;
function fixedTrack(id,change){const value=tracks();for(const endpoint of ['from','to'])Object.assign(value[id][endpoint],change);return value;}
function tinyCast(){
 return Object.fromEntries(['A','B'].map(id=>[id,{id,width:96,height:112,alphaBounds:{x:12,y:12,width:16,height:20},draw(ctx){ctx.fillStyle='#243E66';ctx.fillRect(12,12,16,20);}}]));
}

for(const [name,change] of [
 ['negative x',{x:-200}],['negative y',{y:-150}],['past right edge',{x:1900}],['past bottom edge',{y:1070}],['oversized scale',{scale:30}],
])test(`real session rejects ${name} for either mirrored direction at both endpoints`,()=>{
 for(const id of ['A','B'])for(const endpoint of ['from','to']){
  const value=tracks();Object.assign(value[id][endpoint],change);
  assert.throws(()=>createRenderSession({plan:fixture(),adapters:syntheticCast(),tracks:value}),clipping);
 }
});
test('zero opacity does not authorize an unsupported offscreen entrance or exit',()=>{
 const value=fixedTrack('A',{x:-200,alpha:0});assert.throws(()=>createRenderSession({plan:fixture(),adapters:syntheticCast(),tracks:value}),clipping);
});
test('real session validates captured alpha and mirror geometry rather than transparent image rectangles',()=>{
 const mirrored=fixedTrack('A',{x:-50,y:400,scale:1,side:-1});
 const session=createRenderSession({plan:fixture(),adapters:tinyCast(),tracks:mirrored});
 for(const frame of [0,1,12,25,38,49,50,51,359]){
  const rendered=session.render(frame);assert.deepEqual(rendered.avatarRecords[0].bounds,{x:18,y:412,width:16,height:20});
  assert.equal(rendered.avatarMask.getContext('2d').getImageData(20,420,1,1).data[3],255);rendered.dispose();
 }
 assert.throws(()=>createRenderSession({plan:fixture(),adapters:tinyCast(),tracks:fixedTrack('A',{x:-50,y:400,scale:1,side:1})}),clipping);
});
test('bilinear edge support is checked even when the raw transformed alpha rectangle touches zero',()=>{
 // x=-24 puts x=12 native ink exactly at x=0 when scaled by2, but low
 // bilinear filtering carries nonzero alpha to x=-1, so this must reject.
 assert.throws(()=>createRenderSession({plan:fixture(),adapters:tinyCast(),tracks:fixedTrack('A',{x:-24,y:400,scale:2})}),clipping);
 const session=createRenderSession({plan:fixture(),adapters:tinyCast(),tracks:fixedTrack('A',{x:-23,y:400,scale:2})});
 const result=session.render(25);assert.equal(result.avatarRecords[0].bounds.x,1);result.dispose();
});
for(const [label,x,y,frame,role] of [
 ['header',80,0,0,'header'],['player name',345,430,0,'name:A'],['revealed score',870,465,100,'score:RR:0'],['subtitle',700,930,0,'subtitle'],
])test(`real renderer rejects custom avatar collision with ${label} ink`,()=>{
 const session=createRenderSession({plan:fixture(),adapters:syntheticCast(),tracks:fixedTrack('A',{x,y})});
 assert.throws(()=>session.render(frame),error=>{assert.match(error.message,/32px clearance from visible text ink/);assert(error.details.roles.includes(role));assert(error.details.actualGap<32);assert.equal(error.details.requiredGap,32);assert.equal(error.details.metric,'chebyshev_pixel_gap');return true;});
});
test('a safe-endpoint path with an intermediate header collision fails at the actual requested frame',()=>{
 const value=tracks();value.A={startFrame:12,endFrame:52,easing:'linear',from:{x:600,y:0,scale:.5,side:1,alpha:1},to:{x:-5,y:0,scale:.5,side:1,alpha:1}};
 const session=createRenderSession({plan:fixture(),adapters:syntheticCast(),tracks:value}),cache=createRasterCache(session);
 for(const frame of [0,11,12,52,53,359]){const result=session.render(frame);result.dispose();}
 const before=cache.get(12);assert.throws(()=>session.render(32),/clearance/);assert.throws(()=>cache.get(32),/clearance/);assert.deepEqual(cache.get(12),before);
 assert.equal(cache.stats().size,1,'A rejected frame must never enter the raster cache');
});
test('current frame geometry is checked defensively even if the sampler later regresses between valid endpoints',()=>{
 const probe=spawnSync(pythonCommand(),['-c','import sys; print(sys.executable)'],{encoding:'utf8'});assert.equal(probe.status,0,probe.stderr);const projectPython=probe.stdout.trim();
 withSourceFixture(root=>{
  const file=path.join(root,'production/src/animatic/avatar.mjs'),source=fs.readFileSync(file,'utf8'),anchor="x: interpolate('x'), y: interpolate('y'), scale: interpolate('scale'),";
  assert(source.includes(anchor));fs.writeFileSync(file,source.replace(anchor,"x: frame===25?-200:interpolate('x'), y: interpolate('y'), scale: interpolate('scale'),"));
  const code="import fs from 'node:fs';import {createRenderSession} from './production/src/animatic/render-frame.mjs';import {syntheticCast} from './tests/fixtures/animatic/synthetic-cast.mjs';const session=createRenderSession({plan:JSON.parse(fs.readFileSync('tests/fixtures/animatic/minimal-plan.json')),adapters:syntheticCast()});session.render(25);";
  const result=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024,env:{...process.env,PYTHON:projectPython}});
  assert.notEqual(result.status,0);assert.match(result.stdout+result.stderr,clipping);
 });
});
test('real avatar masks retain pinned low smoothing and default cold/cached pixels',()=>{
 const session=createRenderSession({plan:fixture(),adapters:syntheticCast()}),cache=createRasterCache(session);
 for(const frame of [0,13,25,38,50,70,100,170,240,359]){
  const result=session.render(frame);assert.equal(result.canvas.getContext('2d').imageSmoothingEnabled,true);assert.equal(result.canvas.getContext('2d').imageSmoothingQuality,'low');
  assert.equal(result.avatarMask.getContext('2d').imageSmoothingQuality,'low');const bytes=result.canvas.toBuffer('image/png');result.dispose();assert.deepEqual(cache.get(frame),bytes);
 }
});

test('runtime clearance follows newly visible score ink rather than only a static layout preflight',()=>{
 const session=createRenderSession({plan:fixture(),adapters:syntheticCast(),tracks:fixedTrack('A',{x:870,y:465})});
 const before=session.render(89);assert.equal(before.state.revealedScores.RR[0],null);before.dispose();
 assert.throws(()=>session.render(90),error=>{assert(error.details.roles.includes('score:RR:0'));assert(error.details.actualGap<32);return true;});
});

test('real runtime reads only proven avatar neighborhoods instead of full-frame mask copies',()=>{
 const probe=spawnSync(pythonCommand(),['-c','import sys; print(sys.executable)'],{encoding:'utf8'});assert.equal(probe.status,0,probe.stderr);
 withSourceFixture(root=>{
  const file=path.join(root,'production/src/animatic/render-frame.mjs'),source=fs.readFileSync(file,'utf8'),anchor="import {createCanvas} from '@napi-rs/canvas';";
  assert(source.includes(anchor));fs.writeFileSync(file,source.replace(anchor,`import {createCanvas as nativeCreateCanvas} from '@napi-rs/canvas';
export const frameMaskReads=[];
function createCanvas(width,height){const canvas=nativeCreateCanvas(width,height),ctx=canvas.getContext('2d'),read=ctx.getImageData.bind(ctx);if(width===1920&&height===1080)ctx.getImageData=(...args)=>{frameMaskReads.push(args);return read(...args);};return canvas;}`));
  const code="import assert from 'node:assert/strict';import fs from 'node:fs';import {createRenderSession,frameMaskReads} from './production/src/animatic/render-frame.mjs';import {syntheticCast} from './tests/fixtures/animatic/synthetic-cast.mjs';const s=createRenderSession({plan:JSON.parse(fs.readFileSync('tests/fixtures/animatic/minimal-plan.json')),adapters:syntheticCast()});const r=s.render(0);assert(frameMaskReads.length>0);assert(frameMaskReads.every(([x,y,w,h])=>x>=0&&y>=0&&w<=256&&h<=8));assert(frameMaskReads.reduce((sum,[x,y,w,h])=>sum+w*h*4,0)<1024*1024);r.dispose();";
  const result=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024,env:{...process.env,PYTHON:probe.stdout.trim()}});assert.equal(result.status,0,result.stdout+result.stderr);
 });
});
