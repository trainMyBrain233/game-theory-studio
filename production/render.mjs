import {createCanvas} from '@napi-rs/canvas';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {prepareAssets} from './src/primitives.mjs';
import {drawFrame,FPS,DURATION} from './src/scenes.mjs';
const args=process.argv.slice(2),val=(key,d)=>{const i=args.indexOf(key);return i<0?d:args[i+1]};
const still=args.includes('--stills'),preview=args.includes('--preview');
const width=Number(val('--width',1920)),height=width*9/16;
await prepareAssets(width/1920*1.15);
fs.mkdirSync('output',{recursive:true});
const canvas=createCanvas(width,height);
if(still){
 const times=val('--times','3,8.3,21,27,38.2,44.5,48.5,54,61.5,68,73,83,88.5,96,100.5,104.5,108.5,117.9,126.3,134.6,142.8,147,154,160,166.5,172,11.35,30.95,56.4,75.55,87.3,98.55,99,156.3').split(',').map(Number);
 for(const t of times){drawFrame(canvas,t);fs.writeFileSync(`output/frame_${t.toFixed(2)}_${width}.png`,canvas.toBuffer('image/png'));}console.log(`Rendered ${times.length} native ${width}x${height} frames.`);
}else{
 const start=Number(val('--start',preview?27.3:0)),dur=Number(val('--duration',preview?13:DURATION)),file=val('--out',`output/${preview?'transition_preview':'game_theory_textbook_v2_clean'}_${width}.mp4`);
 const f=spawn('ffmpeg',['-y','-f','rawvideo','-pixel_format','rgba','-video_size',`${width}x${height}`,'-framerate',String(FPS),'-i','-','-vf','scale=out_color_matrix=bt709:out_range=tv,setsar=1','-c:v','libx264','-profile:v','high','-level:v',width>1920?'5.1':'4.1','-refs','4','-x264-params','colorprim=bt709:transfer=bt709:colormatrix=bt709','-preset','slow','-crf','16','-pix_fmt','yuv420p','-threads','6','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-movflags','+faststart',file],{stdio:['pipe','ignore','pipe']});
 let logs='';f.stderr.on('data',d=>{logs+=d.toString();if(logs.length>20000)logs=logs.slice(-10000)});f.stdin.on('error',()=>{});
 const startClock=Date.now(),count=Math.round(FPS*dur);
 for(let i=0;i<count;i++){drawFrame(canvas,start+i/FPS);if(!f.stdin.write(canvas.data()))await once(f.stdin,'drain');if(i%150===0)console.log(`${i}/${count} frames; ${((Date.now()-startClock)/1000).toFixed(1)} sec`)}
 f.stdin.end();const [code]=await once(f,'close');if(code)throw new Error(`ffmpeg failed: ${code}\n${logs}`);console.log(`Rendered ${file} in ${((Date.now()-startClock)/1000).toFixed(1)} sec.`);
}
