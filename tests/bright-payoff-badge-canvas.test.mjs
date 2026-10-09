// Native Canvas and verified SC fonts: badge containment is independent of canvas bounds.
import '../scripts/isolated-fonts.mjs';
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {DATA,TOKENS,drawScene} from '../design/render-proposals.mjs';
import {canvasFont,FONT_FAMILY} from '../typography/fonts.mjs';
import {assertAppliedFont} from '../typography/font-contract.mjs';
const pixels=(canvas,x,y,w,h)=>Buffer.from(canvas.getContext('2d').getImageData(x,y,w,h).data);
const source=fs.readFileSync(new URL('../design/render-proposals.mjs',import.meta.url),'utf8');
const badgeSource=source.slice(source.indexOf('function brightLabelInk('),source.indexOf('function brightPayoff(scene)'));
function stress(row=DATA.selected.row,column=DATA.selected.column){const d=structuredClone(DATA);d.selected.row=row;d.selected.column=column;d.selected.actorA=d.strategies[row].id;d.selected.actorB=d.strategies[column].id;d.actors[0].label='甲方同学';d.actors[1].label='乙方同学';d.payoffs[d.selected.row][d.selected.column]=[99,99];return d;}
function render(data,width=1920){
 const canvas=createCanvas(width,width*9/16),c=canvas.getContext('2d'),cards=[],texts=[];
 const rect=c.fillRect.bind(c),text=c.fillText.bind(c);
 c.fillRect=(x,y,w,h)=>{if(y===769)cards.push({x,y,width:w,height:h});return rect(x,y,w,h)};
 c.fillText=(value,x,y)=>{texts.push({value,x,y,font:c.font});return text(value,x,y)};
 return {canvas,cards,texts,bounds:drawScene(canvas,'bright','payoff',{data})};
}

test('default and four-character 99-point badges retain 34px type, real pixels and padded containment',()=>{
 for(const data of [DATA,stress(0,0),stress(0,1),stress(1,0),stress(1,1)])for(const width of [1920,960]){
  const {canvas,cards,texts,bounds}=render(data,width),scale=width/1920;
  assert.equal(cards.length,2);
  for(const [i,card] of cards.entries()){
   const label=data.actors[i].label,score=data.payoffs[data.selected.row][data.selected.column][i],value=`${label} · ${score}分`;
   const box=bounds.find(b=>b.text===value),run=texts.find(t=>t.value===value);
   assert.equal(run.font,`700 34px "${FONT_FAMILY}"`);assert.equal(box.size,34*scale);
   assert.ok(box.x>=(card.x+14)*scale);assert.ok(box.x+box.width<=(card.x+card.width-14)*scale);
   assert.ok(box.y>=(card.y+10)*scale);assert.ok(box.y+box.height<=(card.y+card.height-10)*scale);
   if(data===DATA)assert.equal(card.width,190);else assert.ok(card.width>270&&card.width<=360);
   // Independent glyph and shape rendering, deliberately without canvasFont or badge helper.
   const expected=createCanvas(width,width*9/16),ctx=expected.getContext('2d');ctx.scale(scale,scale);
   ctx.fillStyle=TOKENS.styles.bright.paper;ctx.fillRect(0,0,1920,1080);
   ctx.fillStyle=i===0?TOKENS.styles.bright.accent:'#DAD4EA';ctx.fillRect(card.x,769,card.width,69);
   ctx.strokeStyle=TOKENS.styles.bright.ink;ctx.lineWidth=4;ctx.lineJoin='round';ctx.strokeRect(card.x,769,card.width,69);
   ctx.font=`700 34px "${FONT_FAMILY}"`;ctx.fillStyle=TOKENS.styles.bright.ink;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(value,i===0?1218:1620,801);
   const crop=[Math.floor((card.x-4)*scale),Math.floor(765*scale),Math.ceil((card.width+8)*scale),Math.ceil(77*scale)];
   assert.deepEqual(pixels(canvas,...crop),pixels(expected,...crop),'Actual badge pixels must match the requested 34px face and card');
  }
  assert.ok(cards[0].x>974&&cards[0].x+cards[0].width+32<cards[1].x,'Cards stay in their result lanes with clear separation');
  const rowName=bounds.find(b=>b.text===data.actors[0].label);
  assert.ok(rowName.x+rowName.width<=(194-35*.3-8)*scale);
  // Choice labels must clear the visible symbol, not just other text bounds.
  for(const [i,origin] of [1082,1482].entries()){
   const run=texts.find(t=>t.value===`${data.actors[i].label}选`),box=bounds.find(b=>b.text===run.value);
   const choice=texts.find(t=>t.y===380&&t.x>origin&&['红','蓝'].includes(t.value));
   assert.ok(box.x+box.width<=(choice.x-34*.6-34*.32-8)*scale);
  }
 }
});

test('old 190px badge fails containment despite fitting on the overall canvas; oversized text is rejected',()=>{
 const c=createCanvas(1920,1080).getContext('2d');
 const make=s=>new Function('c','canvasFont','assertAppliedFont','FONT_FAMILY','S','rect','txt',s+';return brightPayoffBadge;')(c,canvasFont,assertAppliedFont,FONT_FAMILY,TOKENS.styles.bright,()=>{},()=>{});
 const old=badgeSource.replace(/const width=Math.max\(190,[^\n]+/, 'const width=190;');assert.notEqual(old,badgeSource);
 assert.throws(()=>make(old)('甲方同学 · 99分',1218,'#fff'),/Bright payoff badge text does not fit/);
 assert.throws(()=>make(badgeSource)('甲'.repeat(20)+' · 99分',1218,'#fff'),/Bright payoff badge text does not fit/);
});
