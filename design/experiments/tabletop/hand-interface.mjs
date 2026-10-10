/** Registration contract only. No bitmap, invented fingers or production hookup. */
export const HAND_LAYER_ORDER=Object.freeze(['forearm','rear-palm-thumb','card','front-fingers']);
const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
export function registeredWristTarget(contactWorld,pose,{scale=1,side=1,rotation=0}={}){
 if(!point(contactWorld)||!pose?.registered||!point(pose.wrist)||!point(pose.contact))throw Error('HAND_ANCHOR_REQUIRED: register the actual wrist and pose contact before solving.');
 if(!Number.isFinite(scale)||scale<=0||![1,-1].includes(side)||!Number.isFinite(rotation))throw Error('Invalid hand transform.');
 const x=(pose.contact[0]-pose.wrist[0])*scale*side,y=(pose.contact[1]-pose.wrist[1])*scale;
 const co=Math.cos(rotation),si=Math.sin(rotation);
 return [contactWorld[0]-(x*co-y*si),contactWorld[1]-(x*si+y*co)];
}
export function solveRegisteredContact(contactWorld,pose,transform,solveWrist){
 const target=registeredWristTarget(contactWorld,pose,transform),solved=solveWrist(target);
 if(!point(solved?.wrist)||solved.clamped||Math.hypot(solved.wrist[0]-target[0],solved.wrist[1]-target[1])>.25)throw Error('UNREACHABLE_WRIST: cannot claim contact after IK clamping.');
 return {wrist:solved.wrist,contactWorld,layerOrder:HAND_LAYER_ORDER,registered:true};
}
/** Both hand slots follow one world wrist. Local crop anchors may differ. */
export function handSlotTransforms(wristWorld,pose,{scale=1,side=1,rotation=0}={}){
 // Reuse the same validation/offset transform as contact solving.
 const offset=registeredWristTarget([0,0],pose,{scale,side,rotation});
 if(!point(wristWorld))throw Error('HAND_ANCHOR_REQUIRED: register world wrist.');
 const co=Math.cos(rotation),si=Math.sin(rotation),a=co*scale*side,b=si*scale*side,c=-si*scale,d=co*scale;
 const slots={};
 for(const name of ['rear-palm-thumb','front-fingers']){
  const anchor=pose.layers?.[name]?.wrist;
  if(!point(anchor))throw Error(`HAND_ANCHOR_REQUIRED: register ${name} crop wrist.`);
  slots[name]={matrix:[a,b,c,d,wristWorld[0]-a*anchor[0]-c*anchor[1],wristWorld[1]-b*anchor[0]-d*anchor[1]],localWrist:[...anchor]};
 }
 return {worldWrist:[...wristWorld],gripPoint:[wristWorld[0]-offset[0],wristWorld[1]-offset[1]],slots,drawOrder:HAND_LAYER_ORDER};
}
