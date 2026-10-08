import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadImage} from '@napi-rs/canvas';
import {CAST,resolveCastText} from './cast.mjs';
import {registerFonts,canvasFont} from '../typography/fonts.mjs';
registerFonts();
export const TOKENS=JSON.parse(fs.readFileSync(new URL('../tokens.json',import.meta.url),'utf8'));
const tc=TOKENS.colors;
export const C={paper:tc.paper,ink:tc.ink,muted:tc.secondary,light:tc.line,faint:tc.focus_fill,blue:tc.blue_strategy,red:tc.red_strategy,beige:'#F2E7CE',white:'#FFFFFF'};
export const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const ease=x=>{x=clamp(x);return x*x*x*(x*(x*6-15)+10)};
export const mix=(a,b,p)=>a+(b-a)*p;
export const ramp=(t,start,d=.6)=>ease((t-start)/d);
export const span=(t,a,b)=>ramp(t,a,.4)*(1-ramp(t,b-.4,.4));
export const assets={};
let characterRenderer=null,currentSceneTime=0;
export function setSceneTime(t,canvas){currentSceneTime=t;characterRenderer?.beginFrame?.(canvas)}
export function finishActorLayers(canvas){characterRenderer?.flush?.(canvas)}
export function getActorMask(){return characterRenderer?.getMask?.()||null}
const root=path.dirname(fileURLToPath(import.meta.url));
export const assetLoadReport=[];
export async function prepareAssets(scale=2){
 const names=['person-a','person-b','card-red','card-blue','card-back'];
 assetLoadReport.length=0;
 const placeholder=process.argv.includes('--placeholder-cast');
 if(CAST.renderer_module&&!placeholder){characterRenderer=await import(new URL('../'+CAST.renderer_module,import.meta.url));await characterRenderer.prepare();}else characterRenderer=null;
 for(const n of names){
  const isPerson=n.startsWith('person'),reg=isPerson?CAST.actors[n.at(-1).toUpperCase()]:CAST.strategies[n.slice(5)];
  if(isPerson&&characterRenderer){assetLoadReport.push({id:n,type:'layered_raster',source:reg.asset,pixel_budget:characterRenderer.pixelBudget});continue;}
  const file=path.resolve(root,'..',placeholder&&isPerson?reg.fallback_asset||reg.asset:reg.asset);
  const vw=isPerson?420:140,vh=isPerson?500:190;
  if(path.extname(file).toLowerCase()==='.svg'){
   let svg=fs.readFileSync(file,'utf8');
   // Rasterize true vectors at the delivery resolution; preserve an explicit viewBox.
   const vb=reg.viewBox||[0,0,vw,vh];
   svg=svg.replace(/<svg\b[^>]*>/,`<svg xmlns="http://www.w3.org/2000/svg" width="${vw*scale}" height="${vh*scale}" viewBox="${vb.join(' ')}">`);
   assets[n]=await loadImage(Buffer.from(svg));
   assetLoadReport.push({id:n,type:'svg',source:reg.asset,render_width:vw*scale,render_height:vh*scale,embedded_raster:/<image\b/i.test(svg)});
  } else {
   // High-resolution transparent character layers may be used without mislabeling them as vectors.
   assets[n]=await loadImage(fs.readFileSync(file));
   assetLoadReport.push({id:n,type:'raster',source:reg.asset,native_width:assets[n].width,native_height:assets[n].height,planned_width:vw*scale,planned_height:vh*scale});
  }
 }
}
export let records=[];
export let routes=[];
export function resetRecords(){records=[];routes=[]}
export function tx(c,str,x,y,size=36,weight=400,color=C.ink,align='left',opts={}){
 str=resolveCastText(str); c.save(); c.font=canvasFont(size,weight);c.fillStyle=color;c.textAlign=align;c.textBaseline='alphabetic';
 const m=c.measureText(str);c.fillText(str,x,y);
 if(opts.record!==false && c.globalAlpha>.02){let l=align==='center'?x-m.width/2:align==='right'?x-m.width:x;const tr=c.getTransform(),scale=c.canvas.width/1920;const a=m.actualBoundingBoxAscent||size,b=m.actualBoundingBoxDescent||0;records.push({text:str,x:(tr.a*l+tr.c*(y-a)+tr.e)/scale,y:(tr.b*l+tr.d*(y-a)+tr.f)/scale,width:m.width*Math.abs(tr.a)/scale,height:(a+b)*Math.abs(tr.d)/scale,size,weight,alpha:c.globalAlpha});}
 c.restore();
}
export function line(c,x1,y1,x2,y2,color=C.ink,w=3,p=1,dashed=false){if(p<=0)return;c.save();c.strokeStyle=color;c.lineWidth=w;c.lineCap='round';if(dashed)c.setLineDash([10,10]);c.beginPath();c.moveTo(x1,y1);c.lineTo(mix(x1,x2,p),mix(y1,y2,p));c.stroke();if(c.globalAlpha>.02){const tr=c.getTransform(),s=c.canvas.width/1920;const point=(x,y)=>[(tr.a*x+tr.c*y+tr.e)/s,(tr.b*x+tr.d*y+tr.f)/s];routes.push({from:point(x1,y1),to:point(mix(x1,x2,p),mix(y1,y2,p)),width:w,alpha:c.globalAlpha});}c.restore()}
export function round(c,x,y,w,h,r=12,fill=null,stroke=C.ink,lw=3){c.save();c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill()}if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke()}c.restore()}
export function circle(c,x,y,r,fill=C.paper,stroke=C.ink,w=3){c.save();c.beginPath();c.arc(x,y,r,0,Math.PI*2);if(fill){c.fillStyle=fill;c.fill()}if(stroke){c.strokeStyle=stroke;c.lineWidth=w;c.stroke()}c.restore()}
export function arrow(c,x1,y1,x2,y2,p=1,{color=C.ink,w=3,dashed=false}={}){
 line(c,x1,y1,x2,y2,color,w,p,dashed);if(p<.97)return;const a=Math.atan2(y2-y1,x2-x1);c.save();c.fillStyle=color;c.beginPath();c.moveTo(x2,y2);c.lineTo(x2-15*Math.cos(a-.42),y2-15*Math.sin(a-.42));c.lineTo(x2-15*Math.cos(a+.42),y2-15*Math.sin(a+.42));c.closePath();c.fill();c.restore();
}
export function group(c,alpha,dx,dy,fn){if(alpha<=0)return;c.save();c.globalAlpha*=clamp(alpha);c.translate(dx,dy);fn();c.restore()}
export function reveal(c,t,start,fn,{d=.55,dy=12}={}){const p=ramp(t,start,d);group(c,p,0,(1-p)*dy,fn)}
export function person(c,id,x,y,s=1,alpha=1){if(characterRenderer){characterRenderer.draw(c,id,{x,y,scale:s,alpha,t:currentSceneTime});return;}if(!assets['person-'+id.toLowerCase()])return;group(c,alpha,0,0,()=>{c.drawImage(assets['person-'+id.toLowerCase()],x,y,420*s,500*s);if(CAST.actors[id].badge_anchor!==null)tx(c,id,x+(CAST.actors[id].badge_anchor?.[0]||164)*s,y+((CAST.actors[id].badge_anchor?.[1]||374)+10)*s,26*s,700,C.white,'center',{record:false})})}
export function badge(c,id,x,y,r=25,{name=false}={}){if(id==='A')circle(c,x,y,r,C.ink,null);else round(c,x-r,y-r,r*2,r*2,1,C.ink,null);tx(c,id,x,y+r*.4,r*1.05,700,C.white,'center',{record:false});if(name)tx(c,process.argv.includes('--placeholder-cast')?CAST.actors[id].display_name:CAST.actors[id].type_name||CAST.actors[id].display_name,x+r+17,y+11,31,700)}
export function card(c,kind,x,y,w=112,{angle=0,flip=1,alpha=1,label=true}={}){
 const h=w*190/140;c.save();c.globalAlpha*=alpha;c.translate(x,y);c.rotate(angle);c.scale(Math.max(Math.abs(flip),.012),1);
 const image=assets['card-'+kind];if(image)c.drawImage(image,-w/2,-h/2,w,h);else round(c,-w/2,-h/2,w,h,8,C.paper,C.ink,3);
 if(label&&kind!=='back')tx(c,kind==='red'?'红':'蓝',0,h*.31,Math.max(28,w*.29),700,C.white,'center',{record:false});c.restore();
}
export function cardFlip(c,from,to,x,y,w,p,opts={}){const kind=p<.5?from:to;card(c,kind,x,y,w,{...opts,flip:Math.cos(Math.PI*p)})}
export function tag(c,text,x,y,w,{fill=C.faint,size=30,stroke=null}={}){round(c,x,y,w,54,10,fill,stroke,2);tx(c,text,x+w/2,y+38,size,700,C.ink,'center')}
export function desk(c,alpha=1,y=796,x1=235,x2=1685){group(c,alpha,0,0,()=>{line(c,x1,y,x2,y,C.ink,3.5);line(c,x1+50,y,x1+31,y+72,C.ink,3);line(c,x2-50,y,x2-31,y+72,C.ink,3)})}
export function cross(c,x,y,size=10){line(c,x-size,y-size,x+size,y+size,C.muted,3);line(c,x-size,y+size,x+size,y-size,C.muted,3)}
export function eye(c,x,y,s=1){c.save();c.translate(x,y);c.scale(s,s);c.strokeStyle=C.ink;c.lineWidth=3;c.beginPath();c.moveTo(-30,0);c.quadraticCurveTo(0,-28,30,0);c.quadraticCurveTo(0,28,-30,0);c.stroke();circle(c,0,0,8,C.ink,null);c.restore()}
