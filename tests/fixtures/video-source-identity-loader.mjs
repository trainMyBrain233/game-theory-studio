// Keep real CLI/source identity/model and publication; simulate drawing only.
const source=text=>({format:'module',source:text,shortCircuit:true});
export async function resolve(specifier,context,nextResolve){
 if(specifier==='@napi-rs/canvas')return {url:'identity:canvas',shortCircuit:true};
 return nextResolve(specifier,context);
}
export async function load(url,context,nextLoad){
 if(url==='identity:canvas')return source(`export const createCanvas=()=>({data:()=>Buffer.alloc(4)});`);
 if(url.endsWith('/production/src/primitives.mjs'))return source('export const prepareAssets=async()=>{};');
 if(url.endsWith('/production/src/scenes.mjs'))return source(`
  import fs from 'node:fs';
  import {timeline,TOKENS} from ${JSON.stringify(new URL('./model.mjs',url).href)};
  export {timeline};export const FPS=TOKENS.canvas.fps,DURATION=timeline.duration;
  if(process.env.MUTATE_DURING_IMPORT)fs.appendFileSync(process.env.MUTATE_DURING_IMPORT,'\\n');
  export const drawFrame=()=>{};
 `);
 return nextLoad(url,context);
}
