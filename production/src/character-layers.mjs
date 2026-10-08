/** Public geometry contract, never an asset license or a bitmap container.
 * Every pivot below is in prepared pixels AFTER prepare_flip_x. The world
 * transform can mirror again via side, which is separate from preparation.
 */
export const CHARACTER_LAYERS=Object.freeze(['head','torso','upper','forearm']);
export const BONE_LENGTHS=Object.freeze({upper:164,forearm:218});
// Prepared rig pixels: a chest-level rest, above the card recognition region.
// Cloud RGBA candidate comparison selected y190 over y170/y150. This is a
// pose target, not proof that any independently supplied bitmap has clearance.
export const IDLE_HAND=Object.freeze([250,190]);
export const IDLE_SYMBOL_CLEARANCE=65; // 1080p wrist-to-symbol-center minimum
export const RIG={
 a:{head:[83,-284],headPivot:[113,316],shoulder:[118,102],upperPivot:[54,44],upperElbow:[75,260],forePivot:[35,65],foreHand:[278,105]},
 b:{head:[78,-361],headPivot:[83,408],shoulder:[118,102],upperPivot:[61,40],upperElbow:[58,253],forePivot:[34,69],foreHand:[278,105]}
};
export const CHARACTER_CAPABILITIES=Object.freeze({partsPerActor:4,independentHead:true,independentTorso:true,twoBoneArm:true,eyesMouth:'baked_into_head',wristFingers:'baked_into_forearm',independentEyes:false,independentMouth:false,independentLegs:false,secondArticulatedHand:false});
export function layerContract(id,part){
 id=id.toLowerCase();const r=RIG[id];if(!r||!CHARACTER_LAYERS.includes(part))throw Error('Unknown character layer.');
 const parent={torso:null,head:'torso',upper:'torso',forearm:'upper'}[part];
 const pivot={torso:[0,0],head:r.headPivot,upper:r.upperPivot,forearm:r.forePivot}[part];
 const end={head:null,torso:null,upper:r.upperElbow,forearm:r.foreHand}[part];
 return {id:`${id}_${part}`,part,parent,storedSpace:'unmodified_source_pixels',preparedSpace:'pixels_after_prepare_flip_x',rigSpace:'prepared',worldSpace:'torso_anchor_then_uniform_scale_and_side',prepare_flip_x:part==='torso'||id==='b',pivot,end,cropHeight:part==='upper'?270:null,distribution:'external_private_not_in_MIT_repository'};
}
export function characterManifest(layers=[]){
 return {schemaVersion:'1.0',sourceKind:'layered_rgba_raster',capabilities:CHARACTER_CAPABILITIES,boneLengths:BONE_LENGTHS,idleHand:IDLE_HAND,worldTransformOrder:['translate_torso_anchor','scale_uniform_with_side','rig_local_pose'],layers};
}
