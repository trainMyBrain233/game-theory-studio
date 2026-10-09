import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

// Own only this run's directory. Historical frames (and unrelated user files)
// are neither read nor deleted, and a failed run cannot replace a good movie.
export function renderFrameRun({movie,fps,frameCount,frame}){
 if(!Number.isFinite(fps)||fps<=0||!Number.isSafeInteger(frameCount)||frameCount<=0)throw Error('Invalid tabletop frame count or frame rate.');
 fs.mkdirSync(path.dirname(movie),{recursive:true});
 const run=fs.mkdtempSync(path.join(path.dirname(movie),'.tabletop-run-'));
 try{
  for(let index=0;index<frameCount;index++)fs.writeFileSync(path.join(run,`${String(index).padStart(4,'0')}.png`),frame(index));
  const staged=path.join(run,path.basename(movie));
  const encode=spawnSync('ffmpeg',['-v','error','-y','-threads','1','-framerate',String(fps),'-i',path.join(run,'%04d.png'),'-frames:v',String(frameCount),'-c:v','libx264','-threads','1','-filter_threads','1','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',staged],{encoding:'utf8'});
  if(encode.error||encode.status!==0)throw Error(`FFmpeg failed: ${encode.error?.message??encode.stderr}`);
  const decode=spawnSync('ffmpeg',['-v','error','-threads','1','-i',staged,'-threads','1','-filter_threads','1','-f','null','-'],{encoding:'utf8'});
  if(decode.error||decode.status!==0)throw Error(`Full decode failed: ${decode.error?.message??decode.stderr}`);
  fs.renameSync(staged,movie);
 }finally{fs.rmSync(run,{recursive:true,force:true});}
}
