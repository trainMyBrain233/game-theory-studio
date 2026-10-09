import {createCanvas} from '@napi-rs/canvas';
import fs from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import path from 'node:path';
import {prepareAssets} from './src/primitives.mjs';
import {drawFrame,FPS,DURATION,timeline} from './src/scenes.mjs';
import {renderOptions} from './src/render-options.mjs';
import {checkpointPlan,createStillsManifest,stampCheckpointPng,sha256,STILLS_MANIFEST,TIMELINE_PATH} from './src/checkpoints.mjs';
const {width,height,still,times,explicitTimes,start,frameCount,file}=renderOptions(process.argv.slice(2),DURATION,{fps:FPS,defaultTimes:()=>checkpointPlan(timeline).map(point=>point.time)});
if(!still){const check=spawnSync('ffmpeg',['-version'],{encoding:'utf8'});if(check.error||check.status!==0)throw Error('Video encoding requires ffmpeg on PATH with libx264. Still rendering does not require it.');}
await prepareAssets(width/1920*1.15);
fs.mkdirSync('output',{recursive:true});
const canvas=createCanvas(width,height);
if(still){
 const timelineBytes=fs.readFileSync(new URL(`../${TIMELINE_PATH}`,import.meta.url));
 if(JSON.stringify(JSON.parse(timelineBytes))!==JSON.stringify(timeline))throw Error('Timeline changed after loading the renderer; rerun still rendering.');
 const manifest=createStillsManifest(timelineBytes,{width,...(explicitTimes?{times}:{})});
 const manifestFile=path.join('output',STILLS_MANIFEST);
 // Invalidate the previous set before touching any images. A failed render must
 // never leave an apparently complete manifest pointing to mixed generations.
 fs.rmSync(manifestFile,{force:true});
 for(const point of manifest.checkpoints){drawFrame(canvas,point.time);const png=stampCheckpointPng(canvas.toBuffer('image/png'),manifest,point);fs.writeFileSync(path.join('output',point.file),png);point.sha256=sha256(png);}
 fs.writeFileSync(`${manifestFile}.tmp`,JSON.stringify(manifest,null,2)+'\n');fs.renameSync(`${manifestFile}.tmp`,manifestFile);
 console.log(`Rendered ${manifest.checkpoints.length} native ${width}x${height} frames and ${manifestFile}.`);
}else{
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const f=spawn('ffmpeg',['-y','-f','rawvideo','-pixel_format','rgba','-video_size',`${width}x${height}`,'-framerate',String(FPS),'-i','-','-vf','scale=out_color_matrix=bt709:out_range=tv,setsar=1','-c:v','libx264','-profile:v','high','-level:v',width>1920?'5.1':'4.1','-refs','4','-x264-params','colorprim=bt709:transfer=bt709:colormatrix=bt709','-preset','slow','-crf','16','-pix_fmt','yuv420p','-threads','6','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-movflags','+faststart',file],{stdio:['pipe','ignore','pipe']});
 const completion=once(f,'close').then(([code])=>({code}),error=>({error}));
 let logs='';f.stderr.on('data',d=>{logs+=d.toString();if(logs.length>20000)logs=logs.slice(-10000)});f.stdin.on('error',()=>{});
 await once(f,'spawn');
 const startClock=Date.now(),count=frameCount;
 try{for(let i=0;i<count;i++){drawFrame(canvas,start+i/FPS);await new Promise((resolve,reject)=>f.stdin.write(canvas.data(),error=>error?reject(error):resolve()));if(i%150===0)console.log(`${i}/${count} frames; ${((Date.now()-startClock)/1000).toFixed(1)} sec`)}}catch(error){f.stdin.destroy();f.kill();await completion;throw Error(`Video encoding stopped: ${error.message}\n${logs}`);}
 f.stdin.end();const result=await completion;if(result.error||result.code)throw new Error(`ffmpeg failed: ${result.error?.message??result.code}\n${logs}`);console.log(`Rendered ${file} in ${((Date.now()-startClock)/1000).toFixed(1)} sec.`);
}
