// Exercise the real CLI, options, model validation and manifest producer. Only
// expensive drawing/assets/encoding are simulated; this is not a pixel or video
// acceptance test. Never write a pretend MP4. Calls are recorded for assertions.
const source=text=>({format:'module',source:text,shortCircuit:true});
const recorder=`import fs from 'node:fs';const record=(...args)=>fs.appendFileSync(process.env.CLI_CALLS,JSON.stringify(args)+'\\n');`;
export async function resolve(specifier,context,nextResolve){
 if(specifier==='@napi-rs/canvas')return {url:'test-cli:canvas',shortCircuit:true};
 if(specifier==='node:child_process')return {url:'test-cli:encoder',shortCircuit:true};
 return nextResolve(specifier,context);
}
export async function load(url,context,nextLoad){
 if(url==='test-cli:canvas')return source(`${recorder}
  export function createCanvas(width,height){record('canvas',width,height);return {width,height,data:()=>Buffer.alloc(4),toBuffer:()=>Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6OCEAAAAASUVORK5CYII=','base64')};}
 `);
 if(url==='test-cli:encoder')return source(`${recorder}
  import {EventEmitter} from 'node:events';import {Writable} from 'node:stream';
  export const spawnSync=(command,args)=>{record('encoder-check',command,args);return {status:0};};
  export function spawn(command,args){record('encoder',command,args);const child=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new Writable({write(bytes,encoding,done){record('encoded-frame');done();}});child.stdin.on('finish',()=>queueMicrotask(()=>child.emit('close',0)));child.kill=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;}
 `);
 if(url.endsWith('/production/src/primitives.mjs'))return source(`${recorder}export let ready=false;export const prepareAssets=async scale=>{record('assets',scale);await Promise.resolve();ready=true;};`);
 if(url.endsWith('/production/src/scenes.mjs'))return source(`${recorder}
  import {timeline,TOKENS} from ${JSON.stringify(new URL('./model.mjs',url).href)};
  import {ready} from ${JSON.stringify(new URL('./primitives.mjs',url).href)};
  export {timeline};export const FPS=TOKENS.canvas.fps,DURATION=timeline.duration;
  export const drawFrame=(canvas,time)=>{if(!ready)throw Error('CLI must await asset preparation before drawing');record('draw',time);};
 `);
 return nextLoad(url,context);
}
