import '../scripts/isolated-fonts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRenderSession,PUBLIC_AVATAR_TRACKS} from '../production/src/animatic/render-frame.mjs';
import {createRasterCache} from '../production/src/animatic/raster-cache.mjs';
import {syntheticCast} from './fixtures/animatic/synthetic-cast.mjs';
const fixture=()=>JSON.parse(fs.readFileSync(new URL('./fixtures/animatic/minimal-plan.json',import.meta.url),'utf8'));
const session=createRenderSession({plan:fixture(),adapters:syntheticCast()});
test('raster cache uses only exact frame hits, returns defensive buffers and redraws after eviction',()=>{
 const cache=createRasterCache(session,{maxEntries:2}),expected=session.renderPNG(69);
 assert.deepEqual(cache.get(69),expected);const poisoned=cache.get(69);poisoned.fill(0);
 assert.deepEqual(cache.get(69),expected);assert.notDeepEqual(cache.get(70),expected);
 cache.get(71);assert.equal(cache.stats().size,2);assert.deepEqual(cache.get(69),expected);
 assert.deepEqual(cache.stats(),{hits:2,misses:4,size:2});cache.clear();assert.equal(cache.stats().size,0);assert.deepEqual(cache.get(69),expected);
});
test('session captures caller-owned plan and provider pixels instead of relying on mutable callbacks',()=>{
 const plan=fixture(),adapters=syntheticCast(),tracks=structuredClone(PUBLIC_AVATAR_TRACKS),frozen=createRenderSession({plan,adapters,tracks});
 const expected=frozen.renderPNG(100);plan.caseData.values.RR[0]=99;adapters.A.draw=ctx=>ctx.fillRect(0,0,96,112);tracks.A.to.x=900;
 assert.deepEqual(frozen.renderPNG(100),expected);
});
test('case, actual provider pixels, geometry tracks and title get distinct session fingerprints/caches',()=>{
 const plan=fixture();plan.caseData.values.RR[0]=8;
 for(const block of [plan.blocks[1],plan.blocks[3]]){block.voiceover=block.voiceover.replaceAll('二分','八分');for(const phase of block.subtitles)phase.lines=phase.lines.map(line=>line.replaceAll('二分','八分'));}
 const tracks=structuredClone(PUBLIC_AVATAR_TRACKS);tracks.A.to.x=210;
 const sessions=[session,createRenderSession({plan,adapters:syntheticCast()}),createRenderSession({plan:fixture(),adapters:syntheticCast({accent:'#FF7700'})}),createRenderSession({plan:fixture(),adapters:syntheticCast(),tracks}),createRenderSession({plan:fixture(),adapters:syntheticCast(),title:'独立会话'})];
 assert.equal(new Set(sessions.map(session=>session.fingerprint)).size,sessions.length);
 const outputs=sessions.map(session=>createRasterCache(session).get(100));
 for(let index=1;index<outputs.length;index++)assert.notDeepEqual(outputs[index],outputs[0]);
 assert.equal(createRenderSession({plan:fixture(),adapters:syntheticCast()}).fingerprint,session.fingerprint);
});
test('cache rejects invalid capacity/session/frame and never aliases adjacent semantic frames',()=>{
 for(const maxEntries of [0,-1,.5,1025,Infinity])assert.throws(()=>createRasterCache(session,{maxEntries}));
 assert.throws(()=>createRasterCache({fingerprint:'pretend'}));const cache=createRasterCache(session);
 for(const frame of [-1,.5,360,Infinity,NaN,'1'])assert.throws(()=>cache.get(frame));
 for(const [left,right] of [[19,20],[39,40],[69,70],[89,90],[99,100],[119,120],[139,140],[239,240]]){
  assert.deepEqual(cache.get(left),session.renderPNG(left));assert.deepEqual(cache.get(right),session.renderPNG(right));
 }
});

test('retained provider context/canvas cannot alter private session pixels or cache identity',()=>{
 const adapters=syntheticCast(),draw=adapters.A.draw;let retained;
 adapters.A.draw=ctx=>{retained=ctx;draw(ctx)};
 const captured=createRenderSession({plan:fixture(),adapters}),cache=createRasterCache(captured,{maxEntries:1}),identity=captured.fingerprint,expected=captured.renderPNG(0);
 assert.deepEqual(cache.get(0),expected);
 retained.canvas.width=96;retained.canvas.height=112;retained.clearRect(0,0,96,112);retained.fillStyle='magenta';retained.fillRect(0,0,96,112);
 assert.equal(captured.fingerprint,identity);assert.deepEqual(captured.renderPNG(0),expected);assert.deepEqual(cache.get(0),expected);
 cache.get(1);assert.deepEqual(cache.get(0),expected);cache.clear();assert.deepEqual(cache.get(0),expected);
});
