// Keep real Canvas PNG encoding, CLI options, checkpoint stamping and publication;
// replace only scene drawing/assets so publication failures stay fast and precise.
export async function load(url,context,nextLoad){
 const source=text=>({format:'module',source:text,shortCircuit:true});
 if(url.endsWith('/production/src/primitives.mjs'))return source('export const prepareAssets=async()=>{};');
 if(url.endsWith('/production/src/scenes.mjs'))return source(`
  import fs from 'node:fs';
  import {timeline,TOKENS} from ${JSON.stringify(new URL('./model.mjs',url).href)};
  export {timeline};export const FPS=TOKENS.canvas.fps,DURATION=timeline.duration;
  export function drawFrame(canvas,time){
   if(process.env.STILLS_FAIL_TIME===String(time))throw Error('INJECTED_LATE_STILL_DRAW');
   const ctx=canvas.getContext('2d');ctx.fillStyle=time===1?'#123456':'#abcdef';ctx.fillRect(0,0,canvas.width,canvas.height);
   if(process.env.STILLS_MUTATE_TIME===String(time))fs.appendFileSync(new URL('./scenes.mjs',import.meta.url),'\\n// changed during rendering\\n');
  }
 `);
 return nextLoad(url,context);
}
