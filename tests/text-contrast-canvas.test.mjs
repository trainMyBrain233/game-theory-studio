// Actual Canvas consumers: verify applied colors against pixels underneath glyphs.
import '../scripts/isolated-fonts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {TOKENS,DATA,drawScene} from '../design/render-proposals.mjs';
import {contrastRatio} from '../design/text-contrast.mjs';
import {productionPalette} from '../production/src/palette.mjs';
import {createPayoffMatrixElement} from '../production/src/elements/payoff-matrix.mjs';
const hex=(ctx,x,y)=>'#'+[...ctx.getImageData(x,y,1,1).data].slice(0,3).map(v=>v.toString(16).padStart(2,'0')).join('');
const geometry={editorial:[976,421,353,184],textbook:[382,496,332,159],bright:[316,444,310,181]};
test('actual proposal selected-score ink/accent is readable on painted wash, including changed valid wash',()=>{
 for(const id of Object.keys(geometry)){
  const style=TOKENS.styles[id],original=style.wash;
  try{for(const wash of [original,'#FFFFFF']){
   style.wash=wash;
   const canvas=createCanvas(1920,1080),ctx=canvas.getContext('2d'),runs=[];
   const draw=ctx.fillText.bind(ctx);ctx.fillText=function(text,x,y,...args){runs.push({text,x,y,color:this.fillStyle,font:this.font});return draw(text,x,y,...args);};
   for(const selected of [{row:0,column:0},{row:1,column:1}]){
    runs.length=0;drawScene(canvas,id,'payoff',{selected});
    const [x,y,w,h]=geometry[id],cx=x+w*(selected.column+.5),cy=y+h*(selected.row+.5);
    const run=runs.find(r=>r.x===cx&&r.y===cy&&r.text===`(${DATA.payoffs[selected.row][selected.column].join(', ')})`);
    assert.ok(run);assert.equal(run.color.toLowerCase(),(id==='editorial'?style.accent:style.ink).toLowerCase());
    const background=hex(ctx,x+w*selected.column+15,y+h*selected.row+15);
    assert.equal(background,wash.toLowerCase());
    assert.ok(contrastRatio(run.color,background)>=(id==='editorial'?3:4.5));
    if(id==='editorial')assert.match(run.font,/^700 66px /,'3:1 exception requires the actual 66px bold score');
    // Dark-panel glyphs really use the reverse color; this is applied state, not token declarations.
    assert.ok(runs.some(r=>r.color.toLowerCase()===style.paper.toLowerCase()));
   }
  }}finally{style.wash=original;}
 }
});
test('real production matrix paints mapped focus_fill beneath actual ink score glyphs',()=>{
 const palette=productionPalette(TOKENS),canvas=createCanvas(1920,1080),ctx=canvas.getContext('2d'),runs=[];
 ctx.fillStyle=palette.paper;ctx.fillRect(0,0,1920,1080);
 const timeline={segments:[{start:0,end:3,visual_cue:{action:'highlight_choices',matrix_cell:'BR'}},
  {start:3,visual_cue:{action:'reveal_scores',matrix_cell:'BR',score_reveals:[{player:'A',value:5,offset:0},{player:'B',value:0,offset:0}]}}]};
 const drawing={C:{ink:palette.ink,faint:palette.focus_fill},ramp:()=>1,group:(c,a,x,y,fn)=>fn(),reveal:(c,t,start,fn)=>fn(),line:()=>{},
  round(c,x,y,w,h,r,fill){if(fill){c.fillStyle=fill;c.fillRect(x,y,w,h);}},
  tx(c,text,x,y,size,weight,color,align){runs.push({text,color,font:`${weight} ${size}px "GameTheory Noto Sans SC"`});c.font=runs.at(-1).font;c.textAlign=align;c.fillStyle=color;c.fillText(text,x,y);}};
 createPayoffMatrixElement({timeline,summaryStart:20,drawing}).draw(ctx,5);
 const background=hex(ctx,800,690);assert.equal(background,palette.focus_fill.toLowerCase());
 for(const text of ['5','0']){const run=runs.find(r=>r.text===text);assert.ok(run);assert.equal(run.color,palette.ink);assert.ok(contrastRatio(run.color,background)>=4.5);}
});
test('proposal card labels and reverse badges use the actual painted backgrounds',()=>{
 for(const id of Object.keys(geometry)){
  const canvas=createCanvas(1920,1080),ctx=canvas.getContext('2d'),runs=[],draw=ctx.fillText.bind(ctx);
  ctx.fillText=function(text,x,y,...args){const m=this.getTransform();runs.push({text,color:this.fillStyle,
   background:hex(this,Math.round(m.a*x+m.c*y+m.e),Math.round(m.b*x+m.d*y+m.f))});return draw(text,x,y,...args);};
  drawScene(canvas,id,'participants');
  for(const [index,kind] of ['Red','Blue'].entries()){
   const labels=runs.filter(r=>r.text===DATA.strategies[index].label&&r.color.toLowerCase()==='#ffffff');
   assert.equal(labels.length,2);
   for(const run of labels){assert.equal(run.background,TOKENS.semantic[`strategy${kind}`].fill.toLowerCase());assert.ok(contrastRatio(run.color,run.background)>=4.5);}
  }
  const badges=runs.filter(r=>['A','B'].includes(r.text)&&r.background===TOKENS.styles[id].ink.toLowerCase());
  assert.ok(badges.length>=2);for(const run of badges)assert.ok(contrastRatio(run.color,run.background)>=4.5);
 }
});
