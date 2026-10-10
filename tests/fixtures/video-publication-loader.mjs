const source=text=>({format:'module',source:text,shortCircuit:true});
export async function resolve(specifier,context,nextResolve){
 if(specifier==='@napi-rs/canvas')return {url:'publication:canvas',shortCircuit:true};
 return nextResolve(specifier,context);
}
export async function load(url,context,nextLoad){
 // These fixtures isolate options/encoder lifecycle without private art.
 // Real source binding is exercised separately by video-source-identity.
 if(url.endsWith('/production/src/render-fingerprint.mjs'))return source(`export const renderFingerprint=()=>({sha256:'isolated-publication-fixture'});`);
 if(url==='publication:canvas')return source(`export const createCanvas=()=>({data:()=>Buffer.alloc(1024*1024)});`);
 if(url.endsWith('/production/src/primitives.mjs'))return source('export const prepareAssets=async()=>{};');
 if(url.endsWith('/production/src/scenes.mjs'))return source(`export const FPS=30,DURATION=10,timeline={};let calls=0;export const drawFrame=()=>{if(process.env.ENCODER_MODE==='draw'&&calls++===1)throw Error('intentional draw failure');};`);
 return nextLoad(url,context);
}
