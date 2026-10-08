/** Original transparent geometric test figures. No production artwork. */
import {createCanvas} from '@napi-rs/canvas';
import {alphaInkBounds} from '../../../production/src/animatic/avatar.mjs';
export function syntheticCast({accent='#315D91'}={}) {
 return Object.fromEntries(['A','B'].map((id,index)=>{
  const canvas=createCanvas(96,112),ctx=canvas.getContext('2d');
  ctx.fillStyle=accent;ctx.fillRect(22,35,52,64);
  ctx.fillStyle=index?'#BB7350':'#56785B';ctx.fillRect(index?15:26,12,48,28);ctx.fillRect(15,32,66,9);
  ctx.fillStyle='#FFFFFF';ctx.fillRect(35,55,7,8);ctx.fillRect(60,55,7,8);
  ctx.fillStyle='#243E66';ctx.fillRect(54,80,20,5);
  return [id,{id,width:96,height:112,alphaBounds:alphaInkBounds(canvas),draw:target=>target.drawImage(canvas,0,0)}];
 }));
}
