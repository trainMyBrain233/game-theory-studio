// Actual Skia/font regression. Run only when the shared render slot is free:
// node --test tests/proposal-aspect-canvas.test.mjs
import '../scripts/isolated-fonts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {drawScene} from '../design/render-proposals.mjs';

test('drawScene rejects non-16:9 dimensions before asking for a drawing context',()=>{
 for(const [width,height] of [[1920,1000],[1080,1080],[3840,1080]]){
  let touched=false;
  const canvas={width,height,getContext(){touched=true;throw Error('Must not draw');}};
  assert.throws(()=>drawScene(canvas,'textbook','participants'),/16:9/);
  assert.equal(touched,false);
 }
});

test('actual proposal text and circular badge keep uniform proportions at native, reduced and 4K sizes',()=>{
 const references=new Map();
 for(const width of [1920,960,3840]){
  const scale=width/1920,canvas=createCanvas(width,width*9/16);
  const bounds=drawScene(canvas,'textbook','participants');
  assert(bounds.length>0);
  references.set(width,bounds);
  if(width!==1920)for(const [index,box] of bounds.entries()){
   const reference=references.get(1920)[index];
   assert.equal(box.text,reference.text);
   for(const key of ['x','y','width','height','size'])assert(Math.abs(box[key]/scale-reference[key])<.02,`${width}: ${box.text} ${key} changed nonuniformly`);
  }
  // Probe the actual A badge's horizontal and vertical outside edges. Its
  // centered letter is deliberately excluded from these ink measurements.
  const context=canvas.getContext('2d'),ink=[];
  const center=[382*scale,447*scale],r=23*scale;
  for(const axis of [0,1]){
   const samples=[];
   for(let delta=-Math.ceil(r+4);delta<=Math.ceil(r+4);delta++){
    const [x,y]=center.map((value,index)=>Math.round(value+(axis===index?delta:0)));
    const pixel=context.getImageData(x,y,1,1).data;
    // Dark-blue badge fill, ignoring warm-paper and white reverse text.
    if(pixel[0]<100&&pixel[1]<130&&pixel[2]<160)samples.push(delta);
   }
   assert(samples.length>0);ink.push(samples.at(-1)-samples[0]+1);
  }
  assert(Math.abs(ink[0]-ink[1])<=2,`Badge pixel diameter stretched at ${width}: ${ink}`);
 }
});
