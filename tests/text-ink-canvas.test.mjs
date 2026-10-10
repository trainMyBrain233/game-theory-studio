import '../scripts/isolated-fonts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {tx,resetRecords,records} from '../production/src/primitives.mjs';
import {canvasFont} from '../typography/fonts.mjs';
import {actorTextClearance} from '../production/qa/actor-clearance.mjs';

const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-5,`${actual} != ${expected}`);
function pixels(canvas){return canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;}
function inkBounds(canvas){
 const data=pixels(canvas);let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
 for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(data[(y*canvas.width+x)*4+3]){
  left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);
 }
 return {left,top,right,bottom};
}

test('real serif overhang changes a false actor-clearance pass into an infringement',()=>{
 const canvas=createCanvas(1920,1080),c=canvas.getContext('2d');
 resetRecords();tx(c,'f',400,300,100,400,'#000','left',{serif:true,role:'actor-name'});
 const actual=records[0];c.font=canvasFont(100,400,{serif:true});const m=c.measureText('f');
 const old={...actual,x:400,width:m.width};
 const ink=inkBounds(canvas);
 assert.ok(ink.right>old.x+old.width+3,'A genuine project-font glyph must paint past the advance box.');
 close(actual.x,400-m.actualBoundingBoxLeft);close(actual.width,m.actualBoundingBoxLeft+m.actualBoundingBoxRight);
 // Actor pixel is 31px beyond the actually painted right edge, at ink height.
 const mask=createCanvas(1920,1080),mc=mask.getContext('2d');mc.fillRect(ink.right+31,ink.top+5,1,1);
 const spacing={figure_name_gap:32,graphic_text_gap_target:24};
 assert.equal(actorTextClearance(mask,old,spacing).pixels,0,'Old advance-only record falsely passes.');
 assert.ok(actorTextClearance(mask,actual,spacing).pixels>0,'Actual ink record catches the infringement.');
});

test('actual bearings honor default, center, right alignment and the selected baseline',()=>{
 const canvas=createCanvas(480,270),reference=createCanvas(480,270);
 const c=canvas.getContext('2d'),r=reference.getContext('2d');c.scale(.25,.25);r.scale(.25,.25);
 for(const align of [undefined,'center','right'])for(const baseline of ['alphabetic','top','middle','bottom']){
  c.clearRect(0,0,1920,1080);r.clearRect(0,0,1920,1080);resetRecords();
  tx(c,'fj_',400,300,100,400,'#000',align,{serif:true,baseline});
  r.font=canvasFont(100,400,{serif:true});r.textAlign=align??'left';r.textBaseline=baseline;r.fillStyle='#000';
  const m=r.measureText('fj_');r.fillText('fj_',400,300);
  const box=records[0];
  close(box.x,400-m.actualBoundingBoxLeft);close(box.y,300-m.actualBoundingBoxAscent);
  close(box.width,m.actualBoundingBoxLeft+m.actualBoundingBoxRight);close(box.height,m.actualBoundingBoxAscent+m.actualBoundingBoxDescent);
  assert.ok(Buffer.from(pixels(canvas)).equals(Buffer.from(pixels(reference))),'Recording must not change drawn pixels.');
  const ink=inkBounds(canvas);
  // Raster antialiasing may occupy the pixel touching either fractional edge.
  assert.ok(ink.left>=Math.floor(box.x*.25)-1&&ink.right<=Math.ceil((box.x+box.width)*.25)+1);
  assert.ok(ink.top>=Math.floor(box.y*.25)-1&&ink.bottom<=Math.ceil((box.y+box.height)*.25)+1);
 }
});

test('all four affine corners are normalized, including rotation, shear and reflection',()=>{
 // A quarter-resolution canvas exercises delivery-scale normalization too.
 const canvas=createCanvas(480,270),c=canvas.getContext('2d');
 for(const matrix of [[.5,0,0,.5,0,0],[0,.5,-.5,0,400,0],[.4,.2,-.15,.6,100,50],[-.5,.1,.2,-.4,600,400]]){
  c.resetTransform();c.clearRect(0,0,480,270);c.setTransform(...matrix.map(v=>v*.5));resetRecords();
  tx(c,'fj',400,300,100,400,'#000','right',{serif:true});
  c.font=canvasFont(100,400,{serif:true});c.textAlign='right';c.textBaseline='alphabetic';const m=c.measureText('fj');
  const {a,b,c:d,d:e,e:dx,f:dy}=c.getTransform();
  const cx=400+(m.actualBoundingBoxRight-m.actualBoundingBoxLeft)/2,cy=300+(m.actualBoundingBoxDescent-m.actualBoundingBoxAscent)/2;
  const halfW=(m.actualBoundingBoxLeft+m.actualBoundingBoxRight)/2,halfH=(m.actualBoundingBoxAscent+m.actualBoundingBoxDescent)/2;
  const width=2*(Math.abs(a)*halfW+Math.abs(d)*halfH)/.25,height=2*(Math.abs(b)*halfW+Math.abs(e)*halfH)/.25;
  const box=records[0];close(box.width,width);close(box.height,height);
  close(box.x,(a*cx+d*cy+dx)/.25-width/2);close(box.y,(b*cx+e*cy+dy)/.25-height/2);
  const ink=inkBounds(canvas);
  assert.ok(ink.left>=Math.floor(box.x*.25)-1&&ink.right<=Math.ceil((box.x+box.width)*.25)+1);
  assert.ok(ink.top>=Math.floor(box.y*.25)-1&&ink.bottom<=Math.ceil((box.y+box.height)*.25)+1);
 }
});

test('empty and zero-ink strings create no collision box; below-baseline ink stays exact',()=>{
 const c=createCanvas(1920,1080).getContext('2d');
 for(const str of ['',' ','   ','\u200b'])for(const align of ['left','center','right']){
  resetRecords();tx(c,str,400,300,100,400,'#000',align,{serif:true});assert.equal(records.length,0);
 }
 resetRecords();tx(c,'_',400,300,100,400,'#000','left',{serif:true});
 c.font=canvasFont(100,400,{serif:true});const m=c.measureText('_');
 assert.ok(m.actualBoundingBoxAscent<=0);close(records[0].y,300-m.actualBoundingBoxAscent);
 close(records[0].height,m.actualBoundingBoxAscent+m.actualBoundingBoxDescent);
 resetRecords();tx(c,'f',400,300,100,400,'#000','left',{serif:true,record:false});assert.equal(records.length,0);
 c.globalAlpha=0;tx(c,'f',400,300,100,400,'#000','left',{serif:true});assert.equal(records.length,0);
});

test('zero ascent remains zero rather than falling back to the requested font size',()=>{
 const c={canvas:{width:1920},globalAlpha:1,save(){},restore(){},fillText(){},
  getTransform(){return {a:1,b:0,c:0,d:1,e:0,f:0};},
  measureText(){return {width:100,actualBoundingBoxLeft:-2,actualBoundingBoxRight:8,actualBoundingBoxAscent:0,actualBoundingBoxDescent:6};}};
 resetRecords();tx(c,'fixture',400,300,100);
 assert.equal(records[0].x,402);assert.equal(records[0].y,300);
 assert.equal(records[0].width,6);assert.equal(records[0].height,6);
});

test('missing/nonfinite metrics and transforms fail closed instead of hiding text',()=>{
 const valid={width:100,actualBoundingBoxLeft:2,actualBoundingBoxRight:8,actualBoundingBoxAscent:10,actualBoundingBoxDescent:6};
 const identity={a:1,b:0,c:0,d:1,e:0,f:0};
 const c={canvas:{width:1920},globalAlpha:1,save(){},restore(){},fillText(){},getTransform(){return identity;}};
 for(const key of Object.keys(valid).filter(k=>k!=='width'))for(const value of [undefined,NaN,Infinity,-Infinity]){
  c.measureText=()=>({...valid,[key]:value});resetRecords();
  assert.throws(()=>tx(c,'fixture',400,300),/finite actual Canvas bounding-box metrics/);assert.equal(records.length,0);
 }
 c.measureText=()=>valid;
 for(const key of Object.keys(identity))for(const value of [NaN,Infinity]){
  c.getTransform=()=>({...identity,[key]:value});resetRecords();
  assert.throws(()=>tx(c,'fixture',400,300),/finite transformed bounds/);assert.equal(records.length,0);
 }
 c.getTransform=()=>identity;
 for(const width of [0,NaN,Infinity]){c.canvas.width=width;assert.throws(()=>tx(c,'fixture',400,300),/positive canvas scale/);}
 c.canvas.width=1920;c.measureText=()=>({...valid,actualBoundingBoxLeft:-20});
 assert.throws(()=>tx(c,'fixture',400,300),/invalid ink bounds/);
});
