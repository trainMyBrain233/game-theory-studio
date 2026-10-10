// Bounded real-font coverage of the proposal's private text recorder.
import '../scripts/isolated-fonts.mjs';
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {registerFonts,canvasFont,FONT_FAMILY,SERIF_FAMILY} from '../typography/fonts.mjs';
import {assertAppliedFont} from '../typography/font-contract.mjs';
import {checkTextLayout} from '../scripts/layout.mjs';
registerFonts({serif:true});
// Execute the actual private helper without adding a public test-only export.
const source=fs.readFileSync(new URL('../design/render-proposals.mjs',import.meta.url),'utf8');
const factory=new Function('c','bounds','canvasFont','assertAppliedFont','FONT_FAMILY','SERIF_FAMILY',source.slice(source.indexOf('function txt('),source.indexOf('function wrapped('))+';return txt;');
function recorder(c){const bounds=[];return {bounds,txt:factory(c,bounds,canvasFont,assertAppliedFont,FONT_FAMILY,SERIF_FAMILY)};}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
const pixels=c=>Buffer.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data);

test('real serif f overhang is captured where advance-only layout falsely passes',()=>{
 const canvas=createCanvas(600,400),c=canvas.getContext('2d'),{bounds,txt}=recorder(c);
 txt('f',400,200,100,400,'#000','left','serif');
 c.font=canvasFont(100,400,{serif:true});c.textBaseline='middle';const m=c.measureText('f');
 const old={...bounds[0],x:400,width:m.width};
 assert.ok(m.actualBoundingBoxRight>m.width+3);
 checkTextLayout([old],400+m.width,400);
 assert.throws(()=>checkTextLayout(bounds,400+m.width,400),/Text outside canvas: f/);
 let paintedRight=0;const data=pixels(canvas);
 for(let y=0;y<400;y++)for(let x=0;x<600;x++)if(data[(y*600+x)*4+3])paintedRight=Math.max(paintedRight,x+1);
 assert.ok(paintedRight>old.x+old.width+3,'Actual glyph pixels exceed the old box');
 close(bounds[0].x,400-m.actualBoundingBoxLeft);close(bounds[0].width,m.actualBoundingBoxLeft+m.actualBoundingBoxRight);
});

test('middle-baseline ink uses aligned affine corners in physical pixels without changing drawing',()=>{
 const canvas=createCanvas(600,400),reference=createCanvas(600,400),c=canvas.getContext('2d'),r=reference.getContext('2d');
 for(const align of ['left','center','right'])for(const matrix of [[.5,0,0,.5,0,0],[0,.5,-.5,0,400,0],[.4,.2,-.15,.6,100,50],[-.5,.1,.2,-.4,400,250]]){
  for(const ctx of [c,r]){ctx.resetTransform();ctx.clearRect(0,0,600,400);ctx.setTransform(...matrix);}
  const {bounds,txt}=recorder(c);txt('fj_',400,200,100,400,'#000',align,'serif');
  r.font=canvasFont(100,400,{serif:true});r.textBaseline='middle';r.textAlign=align;r.fillStyle='#000';const m=r.measureText('fj_');r.fillText('fj_',400,200);
  const [a,b,cc,d,e,f]=matrix,cx=400+(m.actualBoundingBoxRight-m.actualBoundingBoxLeft)/2,cy=200+(m.actualBoundingBoxDescent-m.actualBoundingBoxAscent)/2;
  const halfW=(m.actualBoundingBoxLeft+m.actualBoundingBoxRight)/2,halfH=(m.actualBoundingBoxAscent+m.actualBoundingBoxDescent)/2;
  const width=2*(Math.abs(a)*halfW+Math.abs(cc)*halfH),height=2*(Math.abs(b)*halfW+Math.abs(d)*halfH),box=bounds[0];
  close(box.width,width);close(box.height,height);close(box.x,a*cx+cc*cy+e-width/2);close(box.y,b*cx+d*cy+f-height/2);
  close(box.size,100*Math.hypot(a,b));close(box.glyphHeight,halfH*2);
  assert.deepEqual(pixels(canvas),pixels(reference));
 }
});

test('zero ink is distinct from invalid metrics and legitimate signed/zero ascent',()=>{
 const c=createCanvas(600,400).getContext('2d');
 for(const text of ['',' ','   ','\u200b'])for(const align of ['left','center','right']){
  const {bounds,txt}=recorder(c);txt(text,300,200,100,400,'#000',align,'serif');assert.equal(bounds.length,0);
 }
 const valid={width:100,actualBoundingBoxLeft:-2,actualBoundingBoxRight:8,actualBoundingBoxAscent:0,actualBoundingBoxDescent:6};
 const identity={a:1,b:0,c:0,d:1,e:0,f:0};
 const stub={save(){},restore(){},fillText(){},measureText:()=>valid,getTransform:()=>identity};
 let run=recorder(stub);run.txt('fixture',300,200,100,400,'#000');assert.equal(run.bounds[0].x,302);assert.equal(run.bounds[0].y,200);assert.equal(run.bounds[0].height,6);
 for(const key of Object.keys(valid).filter(k=>k!=='width'))for(const value of [undefined,NaN,Infinity,-Infinity]){
  stub.measureText=()=>({...valid,[key]:value});run=recorder(stub);
  assert.throws(()=>run.txt('fixture',300,200,100,400,'#000'),/finite actual Canvas bounding-box metrics/);assert.equal(run.bounds.length,0);
 }
 stub.measureText=()=>({...valid,actualBoundingBoxRight:1});
 assert.throws(()=>recorder(stub).txt('fixture',300,200,100,400,'#000'),/invalid ink bounds/);
 stub.measureText=()=>valid;
 for(const key of Object.keys(identity)){
  stub.getTransform=()=>({...identity,[key]:NaN});
  assert.throws(()=>recorder(stub).txt('fixture',300,200,100,400,'#000'),/finite transformed bounds/);
 }
});
