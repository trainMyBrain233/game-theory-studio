import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {renderFingerprint} from './src/render-fingerprint.mjs';
// Capture bytes before importing code that reads model/config, registers fonts,
// or loads Canvas/assets. A post-import snapshot could bless already stale data.
const placeholderCast=process.argv.includes('--placeholder-cast');
const renderIdentity=renderFingerprint({placeholderCast});
const {checkpointPlan,createStillsManifest,stampCheckpointPng,verifyStillsManifest,sha256,STILLS_MANIFEST,TIMELINE_PATH}=await import('./src/checkpoints.mjs');
const timelineFile=new URL(`../${TIMELINE_PATH}`,import.meta.url);
const timelineBytes=fs.readFileSync(timelineFile);
const {renderOptions}=await import('./src/render-options.mjs');
const {encodeVideo}=await import('./src/encode-video.mjs');
const {createCanvas}=await import('@napi-rs/canvas');
const {prepareAssets}=await import('./src/primitives.mjs');
const {drawFrame,FPS,DURATION,timeline}=await import('./src/scenes.mjs');
function verifyRenderInputs(){
 if(!timelineBytes.equals(fs.readFileSync(timelineFile))||renderFingerprint({placeholderCast}).sha256!==renderIdentity.sha256)
  throw Error('Render inputs changed: timeline, renderer, config, assets, fonts or runtime; rerun rendering.');
}
const {width,height,still,times,explicitTimes,start,frameCount,file}=renderOptions(process.argv.slice(2),DURATION,{fps:FPS,defaultTimes:()=>checkpointPlan(timeline).map(point=>point.time)});
if(!still){const check=spawnSync('ffmpeg',['-version'],{encoding:'utf8'});if(check.error||check.status!==0)throw Error('Video encoding requires ffmpeg on PATH with libx264. Still rendering does not require it.');}
const stillManifest=still?createStillsManifest(timelineBytes,{width,placeholderCast,...(explicitTimes?{times}:{})}):null;
await prepareAssets(width/1920*1.15);
verifyRenderInputs();
fs.mkdirSync('output',{recursive:true});
const canvas=createCanvas(width,height);
if(still){
 if(JSON.stringify(JSON.parse(timelineBytes))!==JSON.stringify(timeline))throw Error('Timeline changed after loading the renderer; rerun still rendering.');
 const manifest=stillManifest;
 const manifestFile=path.join('output',STILLS_MANIFEST);
 // Invalidate the previous set before touching any images. A failed render must
 // never leave an apparently complete manifest pointing to mixed generations.
 fs.rmSync(manifestFile,{force:true});
 for(const point of manifest.checkpoints){drawFrame(canvas,point.time);const png=stampCheckpointPng(canvas.toBuffer('image/png'),manifest,point);fs.writeFileSync(path.join('output',point.file),png);point.sha256=sha256(png);}
 verifyStillsManifest(manifest,fs.readFileSync(new URL(`../${TIMELINE_PATH}`,import.meta.url)));
 fs.writeFileSync(`${manifestFile}.tmp`,JSON.stringify(manifest,null,2)+'\n');fs.renameSync(`${manifestFile}.tmp`,manifestFile);
 console.log(`Rendered ${manifest.checkpoints.length} native ${width}x${height} frames and ${manifestFile}.`);
}else{
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const startClock=Date.now(),count=frameCount;
 await encodeVideo({file,beforePublish:verifyRenderInputs,args:['-y','-f','rawvideo','-pixel_format','rgba','-video_size',`${width}x${height}`,'-framerate',String(FPS),'-i','-','-vf','scale=out_color_matrix=bt709:out_range=tv,setsar=1','-c:v','libx264','-profile:v','high','-level:v',width>1920?'5.1':'4.1','-refs','4','-x264-params','colorprim=bt709:transfer=bt709:colormatrix=bt709','-preset','slow','-crf','16','-pix_fmt','yuv420p','-threads','6','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-movflags','+faststart'],frameCount:count,frame:i=>{drawFrame(canvas,start+i/FPS);const bytes=canvas.data();if(i%150===0)console.log(`${i}/${count} frames; ${((Date.now()-startClock)/1000).toFixed(1)} sec`);return bytes;}});
 console.log(`Rendered ${file} in ${((Date.now()-startClock)/1000).toFixed(1)} sec.`);
}
