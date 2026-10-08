/** Private layered-raster cast adapter. The eight painted RGBA layers are not SVG.
 * Geometry is normalized to the existing 420×500 story slot. At the main .84 slot
 * scale the rig draws at .6 in 1080p for clear facial/hand action; 4K character layers use 1.2× scaling.
 */
import {prepareCharacterAssets,drawCharacter,getRigPose} from './rgba_character_rig.mjs';
import {timeline} from './model.mjs';
import {informationChoreography} from './choreography.mjs';
import {createCanvas} from '@napi-rs/canvas';
import {pulse} from './motion.mjs';
let actorMask=null,armQueue=[];
export function getMask(){return actorMask}
export function beginFrame(canvas){armQueue=[];if(!process.argv.includes('--actor-alpha'))return;if(!actorMask||actorMask.width!==canvas.width)actorMask=createCanvas(canvas.width,canvas.height);const c=actorMask.getContext('2d');c.resetTransform();c.clearRect(0,0,canvas.width,canvas.height)}
const T=id=>timeline.segments.find(s=>s.id===id).start;
export const SOURCE_KIND='layered_rgba_raster';
export async function prepare(){await prepareCharacterAssets()}
export const pixelBudget={normal_main_rig_scale_1080:.6,normal_main_rig_scale_4k:1.2,maximum_head_source_scale_4k:1.2,meaning:'Native RGBA layers; figure rig is drawn directly, not enlarged from a low-resolution composited character frame.'};
/** Pose planning can be checked without opening the private PNG files.
 * World units refer to the 1920x1080 layout; they are not image-edge evidence.
 */
export function actorPose(id,{x,y,scale=1,t=0}={}){
 const k=id.toLowerCase(),factor=.6/.84,rigScale=scale*factor,side=id==='A'?1:-1;
 const ax=x+(id==='A'?80:340)*scale,ay=y+268*scale;
 let hand=[250,296],attachment=null,grip=0;
 const info=timeline.sections.find(s=>s.id==='information');
 if(t>=info.start&&t<info.end){const q=informationChoreography(t),rest=[ax+250*rigScale*side,ay+296*rigScale],target=q.handTarget(id,rest);hand=[(target[0]-ax)/(rigScale*side),(target[1]-ay)/rigScale];attachment=q.cards[id].attachment;grip=q.grip;}
 let angle=0;for(const at of [1.4,T('s05_goal')+.5,T('s08_known_unknown')+1.9,T('s09_simultaneous')+1.5,T('s13_options')+.6,T('s18_return_single_round')+3.5,T('s20_definition')+.4])angle+=.028*pulse(t,at,1.6)*(id==='A'?1:-1);
 const opts={x:ax,y:ay,scale:rigScale,t:13,side,handOverride:hand,headAngleOverride:angle};
 const pose=getRigPose(k,13,{handOverride:hand,headAngleOverride:angle});
 const worldPoint=p=>[ax+p[0]*rigScale*side,ay+p[1]*rigScale];
 const world=Object.fromEntries(['shoulder','elbow','requestedHand','solvedHand'].map(key=>[key,worldPoint(pose[key])]));
 return {k,opts,...pose,attachment,grip,world,contactError:pose.contactError*rigScale,attachmentError:attachment?Math.hypot(world.solvedHand[0]-attachment.world[0],world.solvedHand[1]-attachment.world[1]):null};
}
export function draw(ctx,id,{x,y,scale=1,alpha=1,t=0}={}){
 const planned=actorPose(id,{x,y,scale,t}),{k,opts}=planned;
 const renderBody=target=>{
  target.save();target.globalAlpha*=alpha;
  target.save();target.beginPath();target.rect(x-100*scale,y-100*scale,640*scale,580*scale);target.clip();drawCharacter(target,k,{...opts,layer:'body'});target.restore();target.restore();
 };
 renderBody(ctx);
 const tr=ctx.getTransform(),parentAlpha=ctx.globalAlpha;
 if(actorMask){const m=actorMask.getContext('2d');m.save();m.setTransform(tr.a,tr.b,tr.c,tr.d,tr.e,tr.f);m.globalAlpha=parentAlpha;renderBody(m);m.restore();}
 armQueue.push({tr,parentAlpha,alpha,k,opts});
 return planned;
}

export function flush(canvas){
 const c=canvas.getContext('2d');
 for(const q of armQueue){const draw=target=>{target.save();target.setTransform(q.tr.a,q.tr.b,q.tr.c,q.tr.d,q.tr.e,q.tr.f);target.globalAlpha=q.parentAlpha*q.alpha;drawCharacter(target,q.k,{...q.opts,layer:'arm'});target.restore()};draw(c);if(actorMask)draw(actorMask.getContext('2d'));}
 armQueue=[];
}
