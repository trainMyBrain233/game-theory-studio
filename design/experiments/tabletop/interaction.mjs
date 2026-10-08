import {registeredWristTarget} from './hand-interface.mjs';
const clamp=n=>Math.max(0,Math.min(1,n)),smooth=n=>{n=clamp(n);return n*n*n*(n*(n*6-15)+10)},mix=(a,b,p)=>a+(b-a)*p;
export const DEMO={duration:10,fps:30,events:{approach:1,contact:2.2,grab:2.65,place:4.8,supported:6.2,release:6.65,retreat:7.3,rest:8.8}};
export function demoState(t,{scene,camera}){
 if(!Number.isFinite(t)||t<0||t>DEMO.duration)throw Error('Invalid demo time.');
 const e=DEMO.events,phase=t<e.approach||t>=e.rest?'idle':t<e.contact?'approach':t<e.grab?'contact':t<e.place?'hold':t<e.release?'place':t<e.retreat?'release':'retreat';
 const lift=70*smooth((t-e.grab)/1.3)*(1-smooth((t-e.place)/(e.supported-e.place)));
 const close=smooth((t-e.contact)/(e.grab-e.contact))*(1-smooth((t-e.release)/(e.retreat-e.release)));
 const cards=[],arms=[];
 for(const [id,xs] of [['A',[430,560]],['B',[1354,1484]]]){
  const side=id==='A'?1:-1,selected=id==='A'?scene.selected.actorA:scene.selected.actorB,p=camera.actors[id];
  let selectedCard;
  for(const [i,strategy] of scene.strategies.entries()){
   const chosen=strategy.id===selected,width=98,height=width*190/140,bottom=906-(chosen?lift:0),x=xs[i],y=bottom-height/2;
   const card={id:`${id}:${strategy.id}`,actor:id,kind:strategy.id,x,y,width,height,bottom,chosen,controller:chosen&&t>=e.grab&&t<e.release?'hand':'table'};
   cards.push(card);if(chosen)selectedCard=card;
  }
  // Original geometric hand registration, independent of any private art.
  const pose={registered:true,wrist:[0,0],contact:[18,0]},grip=[selectedCard.x-side*selectedCard.width*.4,selectedCard.y-52*selectedCard.width/105];
  const contactWrist=registeredWristTarget(grip,pose,{side}),idle=[id==='A'?477:1420,740];
  const approach=smooth((t-e.approach)/(e.contact-e.approach)),retreat=smooth((t-e.retreat)/(e.rest-e.retreat));
  const wrist=t<e.contact?idle.map((v,i)=>mix(v,contactWrist[i],approach)):t<e.retreat?contactWrist:contactWrist.map((v,i)=>mix(v,idle[i],retreat));
  const shoulder=[p.x+(id==='A'?132:288)*p.scale,p.y+284*p.scale];
  const dx=wrist[0]-shoulder[0],dy=wrist[1]-shoulder[1],distance=Math.hypot(dx,dy),length=150;
  if(distance>=2*length||distance===0)throw Error('UNREACHABLE_WRIST: adjust demo trajectory.');
  const angle=Math.atan2(dy,dx)+side*Math.acos(distance/(2*length)),elbow=[shoulder[0]+length*Math.cos(angle),shoulder[1]+length*Math.sin(angle)];
  arms.push({actor:id,side,shoulder,elbow,wrist,grip,close,handBound:t>=e.grab&&t<e.retreat,card:selectedCard.id});
 }
 return {time:t,phase,cards,arms,lift,close,events:e,status:'original_geometry_only',privateArtLinked:false};
}
