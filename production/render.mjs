import {createCanvas} from '@napi-rs/canvas';
import fs from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import path from 'node:path';
import {prepareAssets} from './src/primitives.mjs';
import {drawFrame,FPS,DURATION} from './src/scenes.mjs';
import {renderOptions} from './src/render-options.mjs';
const {width,height,still,times,start,duration:dur,file}=renderOptions(process.argv.slice(2),DURATION);
if(!still){const check=spawnSync('ffmpeg',['-version'],{encoding:'utf8'});if(check.error||check.status!==0)throw Error('Video encoding requires ffmpeg on PATH with libx264. Still rendering does not require it.');}
await prepareAssets(width/1920*1.15);
fs.mkdirSync('output',{recursive:true});
const canvas=createCanvas(width,height);
if(still){
 for(const t of times){drawFrame(canvas,t);fs.writeFileSync(`output/frame_${t.toFixed(2)}_${width}.png`,canvas.toBuffer('image/png'));}console.log(`Rendered ${times.length} native ${width}x${height} frames.`);
}else{
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const f=spawn('ffmpeg',['-y','-f','rawvideo','-pixel_format','rgba','-video_size',`${width}x${height}`,'-framerate',String(FPS),'-i','-','-vf','scale=out_color_matrix=bt709:out_range=tv,setsar=1','-c:v','libx264','-profile:v','high','-level:v',width>1920?'5.1':'4.1','-refs','4','-x264-params','colorprim=bt709:transfer=bt709:colormatrix=bt709','-preset','slow','-crf','16','-pix_fmt','yuv420p','-threads','6','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-movflags','+faststart',file],{stdio:['pipe','ignore','pipe']});
 const completion=once(f,'close').then(([code])=>({code}),error=>({error}));
 let logs='';f.stderr.on('data',d=>{logs+=d.toString();if(logs.length>20000)logs=logs.slice(-10000)});f.stdin.on('error',()=>{});
 await once(f,'spawn');
 const startClock=Date.now(),count=Math.round(FPS*dur);
 try{for(let i=0;i<count;i++){drawFrame(canvas,start+i/FPS);await new Promise((resolve,reject)=>f.stdin.write(canvas.data(),error=>error?reject(error):resolve()));if(i%150===0)console.log(`${i}/${count} frames; ${((Date.now()-startClock)/1000).toFixed(1)} sec`)}}catch(error){f.stdin.destroy();f.kill();await completion;throw Error(`Video encoding stopped: ${error.message}\n${logs}`);}
 f.stdin.end();const result=await completion;if(result.error||result.code)throw new Error(`ffmpeg failed: ${result.error?.message??result.code}\n${logs}`);console.log(`Rendered ${file} in ${((Date.now()-startClock)/1000).toFixed(1)} sec.`);
}
