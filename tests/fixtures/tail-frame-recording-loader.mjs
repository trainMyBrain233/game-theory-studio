// Run the real scene, subtitle and matrix consumers with recording primitives.
// No Canvas, font, asset or encoder dependency is allowed across this boundary.
const source=text=>({format:'module',source:text,shortCircuit:true});
export async function resolve(specifier,context,nextResolve){
 if(specifier==='@napi-rs/canvas')throw Error('Unexpected heavy rendering dependency');
 if(specifier==='node:child_process')return {url:'test-stub:child-process',shortCircuit:true};
 return nextResolve(specifier,context);
}
export async function load(url,context,nextLoad){
 if(url==='test-stub:child-process')return source(`export const spawnSync=()=>{throw Error('Unexpected process boundary');};export const spawn=spawnSync;`);
 if(url.endsWith('/typography/fonts.mjs'))throw Error('Unexpected font dependency');
 if(url.endsWith('/production/src/primitives.mjs'))return source(`
  import {ramp} from ${JSON.stringify(new URL('./motion.mjs',url).href)};
  export {TOKENS} from ${JSON.stringify(new URL('./model.mjs',url).href)};
  export {clamp,ease,mix,ramp,span} from ${JSON.stringify(new URL('./motion.mjs',url).href)};
  export const C={},calls=[];
  // These narrow scene/time fixtures model an explicit completed preparation;
  // the native readiness regression exercises actual assets and failure paths.
  let prepared=false;
  export async function prepareAssets(){prepared=true;}
  export function assertAssetsReady(){if(!prepared)throw Error('Fixture assets are unprepared');}
  let alpha=1;
  export const resetRecords=()=>{calls.length=0;alpha=1;};
  export const setSceneTime=t=>calls.push(['time',t]);
  export const tx=(c,text,x,y,...rest)=>calls.push(['text',text,x,y,alpha,...rest]);
  export const line=(c,...args)=>calls.push(['line',...args]);
  export function group(c,a,x,y,draw){const old=alpha;alpha*=a;try{draw();}finally{alpha=old;}}
  export const reveal=(c,t,start,draw,{d=.45}={})=>group(c,ramp(t,start,d),0,0,draw);
  const noop=()=>{};
  export {noop as round,noop as circle,noop as arrow,noop as person,noop as badge,
   noop as card,noop as cardFlip,noop as tag,noop as desk,noop as eye,noop as finishActorLayers};
 `);
 return nextLoad(url,context);
}
