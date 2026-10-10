import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {canvasFont} from '../../../typography/fonts.mjs';
import {C} from '../../../production/src/primitives.mjs';
import {presentationModel} from './presentation.mjs';
import {loadPublicCast} from './public-cast.mjs';
import {drawIdentityMatrix} from './identity-matrix.mjs';
const read=file=>JSON.parse(fs.readFileSync(new URL(file,import.meta.url),'utf8'));
const config=read('./presentation.json'),base=read('../../scenes.json');
const {avatars}=await loadPublicCast();
const root=path.resolve(import.meta.dirname,'../../..'),output=path.join(root,'artifacts/tabletop-prototype');
fs.mkdirSync(output,{recursive:true});
const rgb=hex=>hex.match(/[a-f0-9]{2}/gi).map(v=>parseInt(v,16));
const pixel=(c,x,y)=>[...c.getImageData(x,y,1,1).data];
function rasterBounds(c,{left,top,right,bottom}){
 const x=Math.max(0,Math.floor(left)-3),y=Math.max(0,Math.floor(top)-3),width=Math.min(1920,Math.ceil(right)+3)-x,height=Math.min(1080,Math.ceil(bottom)+3)-y;
 const data=c.getImageData(x,y,width,height).data;let l=width,t=height,r=-1,b=-1;
 for(let yy=0;yy<height;yy++)for(let xx=0;xx<width;xx++)if(data[(yy*width+xx)*4+3]){l=Math.min(l,xx);r=Math.max(r,xx);t=Math.min(t,yy);b=Math.max(b,yy);}
 assert.ok(r>=l,'Actual draw produced no visible alpha.');return {x:x+l,y:y+t,width:r-l+1,height:b-t+1};
}
function textRegion(c,[text,x,y]){
 const m=c.measureText(text),origin=x-(c.textAlign==='center'?m.width/2:c.textAlign==='right'?m.width:0);
 return {left:origin-m.actualBoundingBoxLeft,right:origin+m.actualBoundingBoxRight,top:y-m.actualBoundingBoxAscent,bottom:y+m.actualBoundingBoxDescent};
}
function capture(context){
 const images=[],text=[],canvas=createCanvas(1920,1080),mask=canvas.getContext('2d');
 // Capture actual renderer calls, then sample the transparent raster, not padded image boxes.
 for(const [method,records] of [['drawImage',images],['fillText',text]]){
  const original=context[method].bind(context);
  context[method]=(...args)=>{
   original(...args);mask.resetTransform();mask.clearRect(0,0,1920,1080);
   for(const property of ['font','textAlign','textBaseline','globalAlpha'])mask[property]=context[property];
   mask.setTransform(context.getTransform());mask[method](...args);
   const region=method==='fillText'?textRegion(mask,args):{left:args[5],top:args[6],right:args[5]+args[7],bottom:args[6]+args[8]};
   const bounds=rasterBounds(mask,region);
   records.push({text:args[0],font:context.font,bounds,pixels:Buffer.from(mask.getImageData(bounds.x,bounds.y,bounds.width,bounds.height).data)});
  };
 }
 return {images,text};
}
const glyphCanvas=createCanvas(1920,1080),glyphContext=glyphCanvas.getContext('2d');
const finalGlyphCanvas=createCanvas(1920,1080),finalGlyphContext=finalGlyphCanvas.getContext('2d');
function glyph(rendered,record,expected,x,y,size,weight=700,align='left',background=C.paper){
 assert.ok(record,`Missing actual text: ${expected}`);assert.equal(record.text,expected,'Actual payoff/name text differs.');
 assert.equal(record.font,canvasFont(size,weight),'Actual applied font must not shrink.');
 const c=glyphContext;c.clearRect(0,0,1920,1080);c.font=canvasFont(size,weight);c.textAlign=align;c.fillText(expected,x,y);
 const bounds=rasterBounds(c,textRegion(c,[expected,x,y]));assert.deepEqual(record.bounds,bounds,`Actual glyph position differs: ${expected}`);
 assert.ok(record.pixels.equals(Buffer.from(c.getImageData(bounds.x,bounds.y,bounds.width,bounds.height).data)),`Actual glyph pixels differ: ${expected}`);
 // Also compare final composited pixels: replayed alpha alone could miss paper-colored,
 // clipped or subsequently erased text in the actual output.
 const final=finalGlyphContext;final.fillStyle=background;final.fillRect(0,0,1920,1080);final.font=canvasFont(size,weight);final.textAlign=align;final.fillStyle=C.ink;final.fillText(expected,x,y);
 assert.ok(Buffer.from(rendered.getImageData(bounds.x,bounds.y,bounds.width,bounds.height).data).equals(Buffer.from(final.getImageData(bounds.x,bounds.y,bounds.width,bounds.height).data)),`FINAL_GLYPH_PIXELS ${expected}`);
}
const reports=[];
for(const variant of ['default','asymmetric-four-character'])for(let row=0;row<2;row++)for(let column=0;column<2;column++){
 const scene=structuredClone(base),presentation=structuredClone(config);
 if(variant!=='default'){
  scene.payoffs=[[[11,12],[21,22]],[[31,32],[41,42]]];scene.strategies[0].label='合作';scene.strategies[1].label='退出';
  presentation.actors.A.name='明月清风';presentation.actors.B.name='青禾山川';
 }
 scene.selected={row,column,actorA:scene.strategies[row].id,actorB:scene.strategies[column].id};
 const view=presentationModel(presentation,scene),canvas=createCanvas(1920,1080),c=canvas.getContext('2d');
 c.fillStyle=C.paper;c.fillRect(0,0,1920,1080);const actual=capture(c);drawIdentityMatrix(c,view,avatars);
 for(let r=0;r<2;r++)for(let col=0;col<2;col++){
  const selected=r===row&&col===column,x=1136+col*286,y=512+r*164;
  assert.deepEqual(pixel(c,x+20,y+20),[...rgb(selected?C.faint:C.paper),255],`MATRIX_FILL ${variant} selected ${row},${column}, cell ${r},${col}`);
  // Sample the exposed top/bottom edge, never an edge overwritten by a neighbour.
  const edgeY=r===0?510:841,edge=pixel(c,x+24,edgeY);
  if(selected)assert.deepEqual(edge,[...rgb(C.ink),255],`MATRIX_BORDER selected ${row},${column}`);
  else assert.notDeepEqual(edge,[...rgb(C.ink),255],`MATRIX_BORDER unselected ${r},${col}`);
  const expected=`(${scene.payoffs[r][col].join(', ')})`;
  glyph(c,actual.text.filter(t=>t.font===canvasFont(48,700))[r*2+col],expected,x+143,y+100,48,700,'center',selected?C.faint:C.paper);
 }
 const names=[`${presentation.actors.B.name}选哪张牌（列）`,presentation.actors.A.name,presentation.actors.A.name];
 const nameDraws=[actual.text[0],...actual.text.filter(t=>t.text===presentation.actors.A.name)];
 assert.equal(actual.images.length,3,'One B column portrait and two A row portraits must actually draw.');
 const clearance=actual.images.map((image,i)=>{
  assert.equal(image.text,avatars[i===0?'B':'A'].image,'Portrait must preserve its configured owner.');
  assert.equal(nameDraws[i].text,names[i]);const a=image.bounds,b=nameDraws[i].bounds,gap=b.x-(a.x+a.width);
  assert.ok(gap>=32,`AVATAR_NAME_CLEARANCE ${i===0?'column-B':`row-A-${i-1}`} actual alpha/ink gap ${gap}px < 32px`);
  assert.equal(nameDraws[i].font,canvasFont(34,700));return {owner:i===0?'B':'A',avatar:a,name:b,gap};
 });
 glyph(c,actual.text[0],names[0],1340,399,34);
 for(let r=0;r<2;r++)glyph(c,nameDraws[r+1],names[r+1],936,574+r*164,34);
 const order=`数对顺序：${presentation.actors.A.name}，${presentation.actors.B.name}`;
 glyph(c,actual.text.find(t=>t.text===order),order,1136,912,34);
 const file=`identity-${variant}-${row}${column}.png`;fs.writeFileSync(path.join(output,file),canvas.toBuffer('image/png'));
 reports.push({variant,selection:{row,column},clearance,image:file});
}
fs.writeFileSync(path.join(output,'matrix-qa.json'),JSON.stringify({status:'pass',publicOriginalOnly:true,reports},null,2)+'\n');
console.log(`Tabletop matrix: ${reports.length} actual rasters; all four fills/borders, owned payoff glyphs and all portrait/name alpha clearances pass.`);
