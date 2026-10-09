// Run the real validate entrypoint with controlled drawing records. No fonts,
// native Canvas, private art, or tracked report writes are needed.
const module=source=>({format:'module',shortCircuit:true,source});
export async function resolve(specifier,context,nextResolve){
 if(specifier==='@napi-rs/canvas')return {url:'test-stub:fading-canvas',shortCircuit:true};
 return nextResolve(specifier,context);
}
export async function load(url,context,nextLoad){
 if(url==='node:fs')return module('export default {writeFileSync(){}};');
 if(url==='test-stub:fading-canvas')return module('export const createCanvas=(width,height)=>({width,height});');
 if(url.endsWith('/production/src/scenes.mjs'))return module(`
 export const DURATION=.01,drawFrame=()=>{};
 export const timeline={visual_contract:{matrix_values:{RR:[3,3],RB:[0,5],BR:[5,0],BB:[1,1]}},segments:[],sections:[]};
 export const content={matrix:{values:[[[3,3],[0,5]],[[5,0],[1,1]]]}};
 `);
 if(url.endsWith('/production/src/cast.mjs'))return module(`export const CAST={renderer_module:'src/character_adapter.mjs',actors:{A:{},B:{}}};`);
 if(url.endsWith('/production/src/model.mjs'))return module(`export const TOKENS={spacing:{figure_name_gap:32,graphic_text_gap_target:24}};`);
 if(url.endsWith('/production/src/primitives.mjs'))return module(`
 const alpha=Number(process.env.FADING_TEXT_ALPHA);
 export const prepareAssets=async()=>{};
 export const records=[{text:'faint outside',alpha,x:60,y:100,width:60,height:36,size:36,role:'actor-name'},
 {text:'overlapping text',alpha,x:100,y:100,width:60,height:36,size:36,role:'body'},
 {text:'opaque isolated text',alpha:1,x:1000,y:500,width:60,height:36,size:36,role:'body'}];
 export const routes=[{alpha,from:[40,115],to:[200,115],width:3}];
 export const getActorMask=()=>({width:1920,height:1080,getContext(){return {getImageData(x,y,width,height){const data=new Uint8ClampedArray(width*height*4);if(100>=x&&100<x+width&&115>=y&&115<y+height)data[((115-y)*width+100-x)*4+3]=1;return {data};}}}});
 `);
 return nextLoad(url,context);
}
