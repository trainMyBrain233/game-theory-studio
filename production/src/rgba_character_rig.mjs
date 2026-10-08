import path from 'node:path';
import fs from 'node:fs';
import {loadImage,createCanvas} from '@napi-rs/canvas';
export const assets={};
const ROOT=path.resolve(import.meta.dirname,'../private_characters/pvz');
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export function ease(x){x=clamp(x);return x*x*x*(10+x*(-15+6*x));}
export const mix=(a,b,t)=>a+(b-a)*t;
function flipped(img){const c=createCanvas(img.width,img.height),x=c.getContext('2d');x.translate(img.width,0);x.scale(-1,1);x.drawImage(img,0,0);return c;}
export async function prepareCharacterAssets(){
 for(const id of ['a','b'])for(const part of ['head','torso','upper','forearm']){
  const file=path.join(ROOT,'assets',`${id}_${part}.png`);
  if(!fs.existsSync(file)){const e=new Error(`Missing private character layer: ${path.relative(path.resolve(import.meta.dirname,'..'),file)}. Supply the private production assets, or run with --placeholder-cast for the original SVG CI cast.`);e.code='PRIVATE_ASSET_MISSING';throw e;}
  const img=await loadImage(file);
  // Only geometric atlas cropping/flipping: the generated alpha is untouched.
  assets[`${id}_${part}`]=(part==='torso'||id==='b')?flipped(img):img;
 }
}
export const RIG={
 a:{head:[83,-284],headPivot:[113,316],shoulder:[118,102],upperPivot:[54,44],upperElbow:[75,260],forePivot:[35,65],foreHand:[278,105]},
 b:{head:[78,-361],headPivot:[83,408],shoulder:[118,102],upperPivot:[61,40],upperElbow:[58,253],forePivot:[34,69],foreHand:[278,105]}
};
export function handAt(id,t){
 const rest=[293,135],selected=[380,143],lift=[423,84],place=[490,143];
 let h=rest;
 const lerp=(a,b,p)=>[mix(a[0],b[0],p),mix(a[1],b[1],p)];
 if(t>=1.6&&t<3.45)h=lerp(rest,selected,ease((t-1.6)/1.85));
 else if(t>=3.45&&t<4.8)h=lerp(selected,lift,ease((t-3.45)/1.35));
 else if(t>=4.8&&t<6.0)h=lerp(lift,place,ease((t-4.8)/1.2));
 else if(t>=6.0&&t<6.7)h=place;
 else if(t>=6.7&&t<7.5)h=lerp(place,rest,ease((t-6.7)/.8));
 else if(t>=8.75&&t<9.45)h=lerp(rest,place,ease((t-8.75)/.7));
 else if(t>=9.45&&t<10.7)h=place;
 else if(t>=10.7&&t<11.65)h=lerp(place,rest,ease((t-10.7)/.95));
 // Arms share the same timeline so the story never implies a sequential game.
 return h;
}
function segment(ctx,img,pivot,end,from,to,{cropHeight=img.height,scale=null}={}){
 const base=Math.atan2(end[1]-pivot[1],end[0]-pivot[0]);
 const len=Math.hypot(end[0]-pivot[0],end[1]-pivot[1]);
 const s=scale??Math.hypot(to[0]-from[0],to[1]-from[1])/len;
 ctx.save();ctx.translate(...from);ctx.rotate(Math.atan2(to[1]-from[1],to[0]-from[0])-base);ctx.scale(s,s);
 ctx.drawImage(img,0,0,img.width,cropHeight,-pivot[0],-pivot[1],img.width,cropHeight);ctx.restore();
}
export function getRigPose(id,t,{handOverride=null,headAngleOverride=null}={}){
 id=id.toLowerCase();const r=RIG[id],requestedHand=handOverride??handAt(id,t),s=r.shoulder;
 let dx=requestedHand[0]-s[0],dy=requestedHand[1]-s[1],rawDistance=Math.hypot(dx,dy),d=rawDistance;
 const l1=164,l2=218;d=Math.min(l1+l2-.5,Math.max(Math.abs(l1-l2)+.5,d));
 const h=[s[0]+dx/(rawDistance||1)*d,s[1]+dy/(rawDistance||1)*d];
 const angle=Math.atan2(dy,dx)+Math.acos(clamp((l1*l1+d*d-l2*l2)/(2*l1*d),-1,1));
 const elbow=[s[0]+Math.cos(angle)*l1,s[1]+Math.sin(angle)*l1];
 const thought=.035*Math.sin(Math.PI*clamp(t/1.8));
 const glance=.045*Math.sin(Math.PI*clamp((t-7.65)/1.5));
 const reaction=(id==='b'?-1:1)*.026*Math.sin(Math.PI*clamp((t-10.6)/1.4));
 return {shoulder:s,elbow,hand:h,requestedHand,handClamped:Math.abs(rawDistance-d)>.001,headAngle:headAngleOverride??(thought-glance+reaction)};
}
/** Draw independently pivoted RGBA layers; x/y anchor the torso top-left.
 * side=1 faces right; side=-1 faces left. This is a tabletop cutout rig,
 * not full-body skeletal animation. Original eyes and mouth are intact.
 */
export function drawCharacter(ctx,id,{x,y,scale=1,t=0,side=null,layer='all',handOverride=null,headAngleOverride=null}={}){
 id=id.toLowerCase();side=side??(id==='b'?-1:1);const r=RIG[id],p=getRigPose(id,t,{handOverride,headAngleOverride});ctx.save();ctx.translate(x,y);ctx.scale(scale*side,scale);
 if(layer==='all'||layer==='body'){
  ctx.drawImage(assets[id+'_torso'],0,0);
  ctx.save();ctx.translate(r.head[0]+r.headPivot[0],r.head[1]+r.headPivot[1]);ctx.rotate(p.headAngle);
  ctx.drawImage(assets[id+'_head'],-r.headPivot[0],-r.headPivot[1]);ctx.restore();
 }
 if(layer==='all'||layer==='arm'){
  segment(ctx,assets[id+'_upper'],r.upperPivot,r.upperElbow,p.shoulder,p.elbow,{cropHeight:270});
  segment(ctx,assets[id+'_forearm'],r.forePivot,r.foreHand,p.elbow,p.hand);
 }
 ctx.restore();return p;
}
