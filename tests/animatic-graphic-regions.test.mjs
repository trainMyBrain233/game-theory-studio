import '../scripts/isolated-fonts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRenderSession,PUBLIC_AVATAR_TRACKS,PUBLIC_GEOMETRY,PUBLIC_GRAPHIC_REGIONS,COLORS} from '../production/src/animatic/render-frame.mjs';
import {createRasterCache} from '../production/src/animatic/raster-cache.mjs';
const fixture=()=>JSON.parse(fs.readFileSync(new URL('./fixtures/animatic/minimal-plan.json',import.meta.url),'utf8'));
const tinyCast=()=>Object.fromEntries(['A','B'].map(id=>[id,{id,width:96,height:112,alphaBounds:{x:12,y:12,width:16,height:20},draw(ctx){ctx.fillStyle='#243E66';ctx.fillRect(12,12,16,20);}}]));
function fixed(x,y,options={}){const value=structuredClone(PUBLIC_AVATAR_TRACKS);for(const end of ['from','to'])Object.assign(value.A[end],{x,y},options);return value;}
function rejection(role){return error=>{assert.match(error.message,/overlaps reserved graphic region/);assert.equal(error.details.graphicRole,role);assert.equal(error.details.avatar,'A');assert(error.details.overlap.width>0);assert(error.details.overlap.height>0);assert(Object.isFrozen(error.details));assert(Object.isFrozen(error.details.graphicRegion));return true;};}
for(const [name,x,y,role]of [
 ['original matrix divider',728,575,'matrix'],['blank matrix cell interior',1040,640,'matrix'],['left card',80,240,'card:A'],['right card',210,240,'card:B'],
])test(`real renderer rejects avatar over ${name} without nearby text`,()=>{
 const session=createRenderSession({plan:fixture(),adapters:tinyCast(),tracks:fixed(x,y)});
 for(const frame of [0,20,30,40,50,359])assert.throws(()=>session.render(frame),rejection(role));
});
test('graphic reservation includes matrix outer stroke and uses the same drawing geometry',()=>{
 const g=PUBLIC_GEOMETRY,region=PUBLIC_GRAPHIC_REGIONS[0];assert.deepEqual(region,{role:'matrix',x:g.matrix.x-g.matrix.strokeWidth/2,y:g.matrix.y-g.matrix.strokeWidth/2,width:g.matrix.width+g.matrix.strokeWidth,height:g.matrix.height+g.matrix.strokeWidth});
 for(const [index,role]of ['A','B'].entries())assert.deepEqual(PUBLIC_GRAPHIC_REGIONS[index+1],{role:`card:${role}`,x:g.cards.x+index*g.cards.stride,y:g.cards.y,width:g.cards.width,height:g.cards.height});
 // Full-native solid ink ending at x=740 misses the fill's interior but covers
 // the left half of its centered 2px stroke. It must also be rejected.
 const cast=tinyCast();cast.A={id:'A',width:4,height:4,alphaBounds:{x:0,y:0,width:4,height:4},draw:ctx=>ctx.fillRect(0,0,4,4)};
 const session=createRenderSession({plan:fixture(),adapters:cast,tracks:fixed(736,580,{scale:1})});assert.throws(()=>session.render(0),rejection('matrix'));
});
test('safe default pixels keep actual matrix dividers and card faces at the shared geometry',()=>{
 const session=createRenderSession({plan:fixture(),adapters:tinyCast()}),g=PUBLIC_GEOMETRY;
 const rgb=hex=>[1,3,5].map(start=>parseInt(hex.slice(start,start+2),16));
 for(const frame of [0,40]){const r=session.render(frame),ctx=r.canvas.getContext('2d');
  assert.deepEqual([...ctx.getImageData(g.matrix.x+100,g.matrix.y+g.matrix.height/2,1,1).data].slice(0,3),rgb(COLORS.line));
  for(const [i,key]of ['red','blue'].entries())assert.deepEqual([...ctx.getImageData(g.cards.x+i*g.cards.stride+20,g.cards.y+20,1,1).data].slice(0,3),rgb(frame===0?COLORS.faint:COLORS[key]));
  r.dispose();
 }
});
test('safe endpoints do not permit a middle frame crossing matrix graphics or caching it',()=>{
 const value=fixed(690,575,{scale:1});value.A.easing='linear';value.A.to.x=1700;
 const session=createRenderSession({plan:fixture(),adapters:tinyCast(),tracks:value}),cache=createRasterCache(session);
 for(const frame of [0,50,51,359]){const r=session.render(frame);r.dispose();}
 const before=cache.get(0);assert.throws(()=>session.render(25),rejection('matrix'));assert.throws(()=>cache.get(25),rejection('matrix'));assert.equal(cache.stats().size,1);assert.deepEqual(cache.get(0),before);
});
test('captured ink may safely approach a graphic while transparent source padding overlaps it',()=>{
 const value=fixed(690,575,{scale:1}),session=createRenderSession({plan:fixture(),adapters:tinyCast(),tracks:value});
 for(const frame of [0,25,50,359]){const r=session.render(frame);assert.equal(r.avatarRecords[0].bounds.x,702);assert(r.avatarRecords[0].supportBounds.x+r.avatarRecords[0].supportBounds.width<PUBLIC_GRAPHIC_REGIONS[0].x);r.dispose();}
});
test('mirrored captured ink is checked and opacity zero hides ink but does not disable later checks',()=>{
 const mirrored=createRenderSession({plan:fixture(),adapters:tinyCast(),tracks:fixed(660,575,{side:-1,scale:1})});assert.throws(()=>mirrored.render(25),rejection('matrix'));
 const value=fixed(728,575);value.A.from.alpha=0;value.A.to.alpha=1;
 const s=createRenderSession({plan:fixture(),adapters:tinyCast(),tracks:value}),first=s.render(0);first.dispose();assert.throws(()=>s.render(25),rejection('matrix'));
});
for(const endpoint of ['from','to'])for(const key of ['rotation','anchor'])test(`real session rejects unsupported ${endpoint}.${key} rather than dropping it`,()=>{
 const value=structuredClone(PUBLIC_AVATAR_TRACKS);value.A[endpoint][key]=key==='rotation'?90:{x:0,y:0};
 assert.throws(()=>createRenderSession({plan:fixture(),adapters:tinyCast(),tracks:value}),/unknown|unsupported/i);
});
test('real session rejects unknown top-level transition options',()=>{
 const value=structuredClone(PUBLIC_AVATAR_TRACKS);value.A.rotation=90;assert.throws(()=>createRenderSession({plan:fixture(),adapters:tinyCast(),tracks:value}),/unknown|unsupported/i);
});
