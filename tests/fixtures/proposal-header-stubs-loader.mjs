// The real proposal header and applied-font parser run without native fonts or Canvas.
const source=text=>({format:'module',source:text,shortCircuit:true});
export async function resolve(specifier,context,nextResolve){
 if(specifier==='@napi-rs/canvas')return {url:'test-stub:canvas',shortCircuit:true};
 if(specifier==='node:child_process')return {url:'test-stub:child-process',shortCircuit:true};
 return nextResolve(specifier,context);
}
export async function load(url,context,nextLoad){
 if(url==='test-stub:child-process')return source(`export const spawnSync=()=>{throw Error('Unexpected process boundary');};export const spawn=spawnSync;`);
 if(url==='test-stub:canvas')return source(`export const createCanvas=()=>{throw Error('Unexpected native Canvas boundary');};export const loadImage=createCanvas;`);
 if(url.endsWith('/typography/fonts.mjs'))return source(`
  export const FONT_FAMILY='GameTheory Noto Sans SC',SERIF_FAMILY='GameTheory Noto Serif SC';
  export const registerFonts=()=>{};
  export const canvasFont=(size,weight,{serif=false}={})=>weight+' '+size+'px "'+(serif?SERIF_FAMILY:FONT_FAMILY)+'"';
 `);
 return nextLoad(url,context);
}
