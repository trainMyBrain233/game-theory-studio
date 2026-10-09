// Keep the actual entry points, scheduling, frame-run, and FFmpeg control flow;
// replace expensive artwork with a tiny valid PNG and vary clip length.
const source=text=>({format:'module',source:text,shortCircuit:true});
export async function resolve(specifier,context,nextResolve){
 if(specifier==='@napi-rs/canvas')return {url:'tabletop-test:canvas',shortCircuit:true};
 return nextResolve(specifier,context);
}
export async function load(url,context,nextLoad){
 if(url==='tabletop-test:canvas')return source(`
  const context=new Proxy({},{get:()=>()=>{},set:()=>true});
  export const createCanvas=()=>({getContext:()=>context,toBuffer:()=>{
   if(process.env.TABLETOP_TEST_DRAW_FAIL)throw Error('intentional tabletop draw failure');
   return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGNQdc8gCTGMahjVMHw1AABzDNQBO/HHpAAAAABJRU5ErkJggg==','base64');
  }});
  export const loadImage=async()=>({});
 `);
 if(url.endsWith('/production/src/primitives.mjs'))return source('export const prepareAssets=async()=>{},card=()=>{},tx=()=>{},line=()=>{},round=()=>{},C={};');
 if(url.endsWith('/tabletop/public-cast.mjs'))return source('export const loadPublicCast=async()=>({arms:{},figures:{},avatars:{}});');
 if(url.endsWith('/tabletop/avatar.mjs'))return source('export const drawAvatar=()=>{};');
 if(url.endsWith('/tabletop/identity-matrix.mjs'))return source('export const drawIdentityMatrix=()=>{};');
 const loaded=await nextLoad(url,context);
 if(url.endsWith('/tabletop/interaction.mjs'))return {...loaded,source:loaded.source.toString()+`\nDEMO.fps=10;DEMO.duration=Number(process.env.TABLETOP_TEST_FRAMES)/10;`};
 if(url.endsWith('/tabletop/layout.mjs'))return {...loaded,source:loaded.source.toString().replace('duration:2,fps:30,frames:60','duration:Number(process.env.TABLETOP_TEST_FRAMES)/10,fps:10,frames:Number(process.env.TABLETOP_TEST_FRAMES)')};
 return loaded;
}
