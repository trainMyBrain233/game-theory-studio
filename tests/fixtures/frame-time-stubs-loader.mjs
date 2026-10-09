// Load the real episode model and drawFrame while replacing only its rendering
// dependencies. Boundary tests must never load Canvas, fonts, assets or ffmpeg.
const source=text=>({format:'module',source:text,shortCircuit:true});
export async function resolve(specifier,context,nextResolve){
 if(specifier==='@napi-rs/canvas')throw Error('Unexpected native rendering dependency');
 if(specifier==='node:child_process')return {url:'test-stub:child-process',shortCircuit:true};
 return nextResolve(specifier,context);
}
export async function load(url,context,nextLoad){
 if(url==='test-stub:child-process')return source(`export const spawnSync=()=>{throw Error('Unexpected process boundary');};export const spawn=spawnSync;`);
 if(url.endsWith('/production/src/primitives.mjs'))return source(`
  export {TOKENS} from ${JSON.stringify(new URL('./model.mjs',url).href)};
  export {clamp,ease,mix,ramp,span} from ${JSON.stringify(new URL('./motion.mjs',url).href)};
  export const C={},calls=[];
  // These narrow scene/time fixtures model an explicit completed preparation;
  // the native readiness regression exercises actual assets and failure paths.
  let prepared=false;
  export async function prepareAssets(){prepared=true;}
  export function assertAssetsReady(){if(!prepared)throw Error('Fixture assets are unprepared');}
  export const resetRecords=()=>calls.push(['resetRecords']);
  export const setSceneTime=t=>calls.push(['setSceneTime',t]);
  const draw=()=>{throw Error('Unexpected drawing boundary');};
  export {draw as tx,draw as line,draw as round,draw as circle,draw as arrow,
   draw as group,draw as reveal,draw as person,draw as badge,draw as card,
   draw as cardFlip,draw as tag,draw as desk,draw as eye,draw as finishActorLayers};
 `);
 if(url.endsWith('/typography/fonts.mjs'))throw Error('Unexpected font dependency');
 return nextLoad(url,context);
}
