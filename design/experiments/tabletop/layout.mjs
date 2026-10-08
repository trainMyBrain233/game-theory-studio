/** Experimental geometry; no production renderer or canonical timeline edits. */
export const VARIANTS=Object.freeze([
 {id:'shared-rail',title:'连续矮牌架',note:'承托槽给出落点；选牌可横移，先落牌再松手。'},
 {id:'separate-stands',title:'独立小牌座',note:'每张牌有固定落点；手姿需要避开座边。'},
 {id:'flat-rest',title:'桌上平放',note:'静置由桌面承托；亮牌再立起，另验符号识别。'}
]);
export const CAMERA=Object.freeze({actors:{A:{x:260,y:340,scale:.84},B:{x:1284,y:340,scale:.84}},width:1920,height:1080});
export const TABLE=Object.freeze({backY:736,frontY:928,frontBottom:950,backLeft:166,backRight:1754,frontLeft:64,frontRight:1856});
const clamp=n=>Math.max(0,Math.min(1,n)),smooth=n=>{n=clamp(n);return n*n*n*(n*(n*6-15)+10)},mix=(a,b,p)=>a+(b-a)*p;
const at=(timeline,id)=>{const s=timeline.segments.find(s=>s.id===id);if(!s)throw Error(`Missing prototype timeline anchor ${id}`);return s.start;};
export function interactionSchedule(timeline){
 const pick=at(timeline,'s08_known_unknown')+1.25,reveal=at(timeline,'s09_simultaneous');
 return {idleEnd:pick,reachEnd:pick+.5,placeStart:reveal+2.3,contact:reveal+2.9,releaseStart:reveal+3.15,releaseEnd:reveal+3.8};
}
/** A fixed-length regression clip follows the rebuilt pickup anchor. */
export function flatRegressionWindow(timeline){
 const {reachEnd}=interactionSchedule(timeline);
 return {start:reachEnd-.15,duration:2,fps:30,frames:60};
}
export function tabletopState(variant,time,{scene,timeline}){
 if(!VARIANTS.some(v=>v.id===variant))throw Error('Unknown tabletop variant.');
 if(!Number.isFinite(time)||time<0||time>=timeline.duration)throw Error('Invalid prototype time.');
 const schedule=interactionSchedule(timeline),move=smooth((time-schedule.reachEnd)/1.3),withdraw=smooth((time-schedule.reachEnd)/.7);
 const phase=time<schedule.idleEnd?'idle':time<schedule.reachEnd?'reach':time<schedule.placeStart?'grasp':time<schedule.releaseStart?'place':'release';
 const raised=smooth((time-schedule.reachEnd)/.8)*(1-smooth((time-schedule.placeStart)/.6)),cards=[];
 for(const [id,initial,final,selected] of [['A',[430,560],495,scene.selected.actorA],['B',[1354,1484],1420,scene.selected.actorB]])for(const [index,strategy] of scene.strategies.entries()){
  const chosen=strategy.id===selected,alpha=chosen?1:1-withdraw;
  const x=chosen&&variant!=='separate-stands'?mix(initial[index],final,move):initial[index];
  const width=98,height=width*190/140,supportY=variant==='flat-rest'?846:906,flat=variant==='flat-rest'?(chosen?1-raised:1):0;
  const visibleHeight=height*mix(1,.28,flat),bottom=supportY-(chosen?raised*34:0),y=bottom-visibleHeight/2;
  // The upper corner nearest the actor, rather than a fixed far-side corner.
  const nearSide=id==='A'?-1:1;
  cards.push({actor:id,kind:strategy.id,label:strategy.label,x,y,width,height,visibleHeight,flat,bottom,supportY,
   standX:variant==='separate-stands'?initial[index]:final,alpha,chosen,
   proposedCardContact:[x+nearSide*width*.4,y-52*width/105*(1-flat*.72)],wristTarget:null,handPoseStatus:'unregistered',support:variant==='flat-rest'?'table-plane':variant});
 }
 return {variant,time,phase,schedule,raised,cards,camera:CAMERA,table:TABLE,status:'prototype',handArtLinked:false,
  desiredDeskContacts:{A:[477,740],B:[1420,740]},rigEnd:'wrist',handLayerOrder:['forearm','rear-palm-thumb','card','front-fingers']};
}
