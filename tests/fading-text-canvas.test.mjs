import '../scripts/isolated-fonts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {drawFrame,timeline} from '../production/src/scenes.mjs';
import {prepareAssets,records,routes,tx,line,group,resetRecords} from '../production/src/primitives.mjs';

// Native Canvas quantizes alpha; use its actual applied value, not the local
// animation scalar or an assumed product that bypasses the context setter.
test('text and lines record the native applied parent/group alpha exactly',()=>{
 const c=createCanvas(1920,1080).getContext('2d');
 for(const alpha of [.12,.02,.001,Number.EPSILON,0]){
  resetRecords();c.globalAlpha=.5;
  group(c,.5,0,0,()=>group(c,alpha,0,0,()=>{
   const applied=c.globalAlpha;tx(c,'测试',100,100);line(c,0,0,100,100);
   assert.equal(records.length,applied>0?1:0);assert.equal(routes.length,applied>0?1:0);
   if(applied>0){assert.equal(records[0].alpha,applied);assert.equal(routes[0].alpha,applied);}
  }));
 }
});

test('single-round caption clears the desk throughout its actual text entrance',async()=>{
 if(!process.argv.includes('--placeholder-cast'))process.argv.push('--placeholder-cast');
 await prepareAssets(1.15);
 const canvas=createCanvas(1920,1080),start=timeline.segments.find(s=>s.id==='s14_simple_case').start,duration=.55;
 const offsets=[-1/30,0,1/30,.05,duration*.25,duration*.5,duration*.75,duration-1/30,duration,duration+1/30];
 let nonzeroSamples=0;
 for(const offset of offsets){
  drawFrame(canvas,start+offset);
  const caption=records.find(r=>r.text==='本例：只有一次决策');
  if(!caption){assert.ok(offset<=1/30);continue;}
  nonzeroSamples++;
  const desk=routes.find(r=>r.from[1]===760&&r.to[1]===760);
  assert.ok(desk);assert.equal(caption.size,32);assert.equal(caption.weight,700);
  assert.ok(caption.y+caption.height+8+desk.width/2<desk.from[1],`caption infringes desk clearance at ${start+offset}: ${JSON.stringify(caption)}`);
  if(offset>=duration)assert.equal(caption.y+caption.height,739,'Settled typography and baseline stay unchanged.');
  canvas.getContext('2d').getImageData(0,0,1,1);
 }
 assert.ok(nonzeroSamples>=7);
});
