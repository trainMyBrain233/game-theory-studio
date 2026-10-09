// CLI routing/QA-boundary tests only. Pixels are original synthetic RGBA data.
const module=source=>({format:'module',shortCircuit:true,source});
export async function resolve(specifier,context,next){
 if(specifier==='@napi-rs/canvas')return {url:'test-stub:episode-alpha-canvas',shortCircuit:true};
 return next(specifier,context);
}
export async function load(url,context,next){
 if(url==='test-stub:episode-alpha-canvas')return module('export const createCanvas=(width,height)=>({width,height});');
 if(url.endsWith('/production/src/scenes.mjs'))return module(`
 export const DURATION=process.env.EPISODE_ALPHA_FIXTURE==='regional-empty'?3:.5,content={matrix:{values:[[[],[]],[[],[]]]}},timeline={segments:[],sections:process.env.EPISODE_ALPHA_FIXTURE==='regional-empty'?[{id:'players',start:0,end:3}]:[],visual_contract:{matrix_values:{RR:[],RB:[],BR:[],BB:[]}}};
 export function drawFrame(canvas,t){globalThis.__alphaFixtureTime=t;}
 `);
 if(url.endsWith('/production/src/model.mjs'))return module('export const CAST={actors:{A:{},B:{}}};export const resolveCastText=x=>x;export const TOKENS={spacing:{figure_name_gap:32,graphic_text_gap_target:24}};');
 if(url.endsWith('/production/src/primitives.mjs'))return module(`
 const mode=process.env.EPISODE_ALPHA_FIXTURE;
 export const records=mode==='no-text'?[]:[{text:'original fixture',role:'actor-name',alpha:1,x:100,y:100,width:40,height:30,size:40}],routes=[];
 export async function prepareAssets(){
  console.log('ALPHA_ROUTE '+JSON.stringify(process.argv.slice(2)));
  if(mode==='asset-error')throw Error('Synthetic asset decode failure');
 }
 export function getActorMask(){
  if(process.argv.includes('--placeholder-cast')||mode==='missing')return null;
  return {width:1920,height:1080,getContext(){return {getImageData(left,top,width,height){
   const data=new Uint8ClampedArray(width*height*4);
   const x=mode==='collision'?140:800,y=mode==='collision'?110:500;
   if(mode!=='empty'&&!(mode==='regional-empty'&&globalThis.__alphaFixtureTime>=.5)&&x>=left&&x<left+width&&y>=top&&y<top+height)data[((y-top)*width+x-left)*4+3]=1;
   return {data};
  }}}};
 }
 `);
 return next(url,context);
}
