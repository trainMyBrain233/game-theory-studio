import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {canvasFont} from '../../typography/fonts.mjs';

// QA's independent, fixed episode geometry. Ink centers are not textAlign
// anchors: digit bearings differ even when their advance widths are identical.
export function assertPayoffOwnership(records,values,row,column,key){
 const ctx=createCanvas(1,1).getContext('2d');
 ctx.font=canvasFont(64,700);ctx.textAlign='center';ctx.textBaseline='alphabetic';
 return values.map((value,owner)=>{
  const text=String(value),m=ctx.measureText(text);
  const anchorX=1020+column*480+(owner===0?-64:64),baseline=609+row*170;
  const expected={x:anchorX-m.actualBoundingBoxLeft,y:baseline-m.actualBoundingBoxAscent,
   width:m.actualBoundingBoxLeft+m.actualBoundingBoxRight,height:m.actualBoundingBoxAscent+m.actualBoundingBoxDescent};
  const glyph=records.find(r=>r.text===text&&r.size===64&&r.weight===700&&r.appliedFont===ctx.font&&
   Object.entries(expected).every(([field,value])=>Math.abs(r[field]-value)<.01));
  assert(glyph,`${key} score ${value} must be at owner ${owner}'s matrix position (actual ink bounds)`);
  return glyph;
 });
}
