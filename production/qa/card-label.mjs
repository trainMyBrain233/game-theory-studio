import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {card,assets,prepareAssets} from '../src/primitives.mjs';
import {CAST} from '../src/model.mjs';
import {canvasFont} from '../../typography/fonts.mjs';
const contract=JSON.parse(fs.readFileSync(new URL('../assets/asset-hotspots.json',import.meta.url),'utf8')).cards;
await prepareAssets(1.15);
let count=0;
for(const kind of ['red','blue'])for(const label of [CAST.strategies[kind].label,'合作','退出'])for(const width of [105,140]){
 const original=CAST.strategies[kind].label;CAST.strategies[kind].label=label;
 try{
  const actual=createCanvas(240,260),expected=createCanvas(240,260),old=createCanvas(240,260);
  card(actual.getContext('2d'),kind,120,130,width);
  const s=width/140,h=width*190/140;
  for(const [canvas,legacy] of [[expected,false],[old,true]]){
   const c=canvas.getContext('2d');c.drawImage(assets['card-'+kind],120-width/2,130-h/2,width,h);
   c.font=canvasFont(legacy?Math.max(28,width*.29):contract.labelStyle.fontSize*s,contract.labelStyle.fontWeight);
   c.fillStyle=contract.labelStyle.fill;c.textAlign=contract.labelStyle.align;c.textBaseline=legacy?'alphabetic':contract.labelStyle.baseline;
   c.fillText(label,120+(contract.labelCenter[0]-70)*s,130+(legacy?h*.31:(contract.labelCenter[1]-95)*s));
  }
  assert.deepEqual(actual.data(),expected.data(),`${kind} ${label} ${width}: actual label must consume the SVG source anchor/style.`);
  assert.notDeepEqual(actual.data(),old.data(),'Old alphabetic baseline and width fraction must fail actual pixels.');count++;
 }finally{CAST.strategies[kind].label=original;}
}
console.log(`Card label pixels: ${count} real SC renderings match the recorded center/middle source contract; legacy baseline/size fails.`);
