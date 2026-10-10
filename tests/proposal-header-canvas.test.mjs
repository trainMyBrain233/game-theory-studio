// Bounded real-font regression: 3840x200 header strips, no scene assets.
import '../scripts/isolated-fonts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {TOKENS,drawComparisonHeader} from '../design/render-proposals.mjs';

const pixels=(canvas,x=70,y=20,width=1000,height=100)=>Buffer.from(canvas.getContext('2d').getImageData(x,y,width,height).data);
function expectedHeading(style,family){
 const canvas=createCanvas(3840,200),context=canvas.getContext('2d');
 context.fillStyle=style.paper;context.fillRect(0,0,canvas.width,canvas.height);
 // Independent request and readback, not canvasFont() or the renderer's bounds.
 context.font=`700 62px "${TOKENS.font[family]}"`;
 assert.equal(context.font,`700 62px "${TOKENS.font[family]}"`);
 context.fillStyle=style.ink;context.textBaseline='middle';context.textAlign='left';
 context.fillText(style.name,84,83);
 return pixels(canvas);
}

test('comparison headings honor default and changed families in applied fonts and actual glyph pixels',()=>{
 for(const id of ['textbook','editorial','bright']){
  const style=TOKENS.styles[id],original=style.titleFamily,alternate=original==='serif'?'sans':'serif';
  const canvas=createCanvas(3840,200),context=canvas.getContext('2d'),drawn=[];
  const fillText=context.fillText.bind(context);
  context.fillText=function(text,...args){drawn.push({text,font:this.font});return fillText(text,...args);};
  try{
   const snapshots=[];
   for(const family of [original,alternate,original]){
    style.titleFamily=family;drawn.length=0;
    const bounds=drawComparisonHeader(canvas,id),heading=bounds.find(box=>box.text===style.name);
    assert.equal(heading.family,TOKENS.font[family]);assert.equal(heading.weight,700);assert.equal(heading.size,62);
    assert.equal(drawn.find(item=>item.text===style.name).font,`700 62px "${TOKENS.font[family]}"`);
    const title=pixels(canvas),subtitle=pixels(canvas,2000,20,1830,100);
    assert.deepEqual(title,expectedHeading(style,family),`${id} ${family}: rendered title glyphs must match the configured face`);
    assert.equal(bounds.find(box=>box.text===style.subtitle).family,TOKENS.font.sans);
    snapshots.push({title,subtitle});
   }
   assert.notDeepEqual(snapshots[0].title,snapshots[1].title,`${id}: changing titleFamily must change real pixels`);
   assert.deepEqual(snapshots[0].title,snapshots[2].title,`${id}: restoring the family must restore identical pixels`);
   assert.deepEqual(snapshots[0].subtitle,snapshots[1].subtitle,`${id}: the subtitle remains Sans`);
  }finally{style.titleFamily=original;}
 }
});

test('comparison header rejects clipped and colliding authored text at its actual font size',()=>{
 const style=TOKENS.styles.textbook,original={...style};
 try{
  for(const mutation of [
   {name:'甲'.repeat(100)},
   {subtitle:'甲'.repeat(110)},
   {name:'甲'.repeat(35),subtitle:'乙'.repeat(50)},
  ]){
   Object.assign(style,original,mutation);
   assert.throws(()=>drawComparisonHeader(createCanvas(3840,1320),'textbook'),/Text outside canvas|Text collision/);
  }
 }finally{Object.assign(style,original);}
});

// Expected glyphs deliberately do not use comparisonBoardTextPlan/canvasFont.
// This catches a real renderer font-size or baseline regression, including at 50%.
test('all comparison captions have 60px applied glyphs, clear divider and 30px preview pixels',()=>{
 const captions=[['场景一 · 参与者',84],['场景二 · 收益矩阵',2004]];
 for(const id of ['textbook','editorial','bright']){
  const style=TOKENS.styles[id],original=style.titleFamily;
  try{
   for(const family of ['sans','serif']){
    style.titleFamily=family;
    const canvas=createCanvas(3840,200),context=canvas.getContext('2d'),drawn=[];
    const fillText=context.fillText.bind(context);
    context.fillText=function(text,...args){drawn.push({text,font:this.font});return fillText(text,...args);};
    const bounds=drawComparisonHeader(canvas,id);
    const expected=createCanvas(3840,200),ctx=expected.getContext('2d');
    ctx.fillStyle=style.paper;ctx.fillRect(0,0,3840,200);
    ctx.font=`700 60px "${TOKENS.font.sans}"`;
    assert.equal(ctx.font,`700 60px "${TOKENS.font.sans}"`);
    ctx.fillStyle=style.ink;ctx.textBaseline='middle';ctx.textAlign='left';
    for(const [text,x] of captions){
     ctx.fillText(text,x,165);
     const box=bounds.find(box=>box.text===text);
     assert.equal(drawn.find(run=>run.text===text).font,`700 60px "${TOKENS.font.sans}"`);
     assert.equal(box.size/2,30);
     assert(box.y>=132,`${id}: caption glyphs need >=6px clearance from the divider's lower edge`);
     assert(box.y+box.height<=198,`${id}: caption glyphs must clear the scene boundary`);
     assert(box.x>=x&&box.x+box.width<x+1836);
    }
    for(const box of bounds.slice(0,2))assert(box.y+box.height<=118,`${id}: heading/subtitle must clear the divider`);
    assert.deepEqual(pixels(canvas,0,132,3840,68),pixels(expected,0,132,3840,68));
    const preview=createCanvas(1920,100),previewExpected=createCanvas(1920,100);
    preview.getContext('2d').drawImage(canvas,0,0,1920,100);
    previewExpected.getContext('2d').drawImage(expected,0,0,1920,100);
    assert.deepEqual(pixels(preview,0,66,1920,34),pixels(previewExpected,0,66,1920,34),`${id}: actual half-size caption pixels`);
   }
  }finally{style.titleFamily=original;}
 }
});
