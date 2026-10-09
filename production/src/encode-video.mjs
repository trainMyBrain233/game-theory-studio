import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';

// The encoder never owns the published path. Keep the extension for ffmpeg's
// format inference and stay in the destination directory for atomic rename.
export async function encodeVideo({file,args,frameCount,frame,command='ffmpeg'}) {
 const temporary=path.join(path.dirname(file),`.${path.basename(file)}.${randomUUID()}.tmp${path.extname(file)}`);
 fs.closeSync(fs.openSync(temporary,'wx'));
 let child,closed,killTimer,logs='',failure;
 let failWake;
 const failed=new Promise(resolve=>{failWake=resolve;});
 const fail=error=>{if(!failure){failure=error;failWake();}};
 const signals=new Map(['SIGINT','SIGTERM','SIGHUP'].map(signal=>[signal,()=>fail(Error(`Rendering interrupted by ${signal}`))]));
 const check=()=>{if(failure)throw failure;};
 const guard=async promise=>{await Promise.race([promise,failed]);check();};
 try {
  child=spawn(command,[...args,temporary],{stdio:['pipe','ignore','pipe']});
  // Unlike events.once(close), this promise must not settle early on 'error':
  // cleanup waits until the child and its pipes have actually closed.
  closed=new Promise(resolve=>child.once('close',(code,signal)=>{
   if(code!==0||signal)fail(Error(`ffmpeg failed: ${signal??code}`));
   else if(!child.stdin.writableFinished)fail(Error('ffmpeg exited before all frames were written'));
   resolve();
  }));
  child.on('error',fail);
  child.stdin.on('error',fail);
  child.stderr.on('error',fail);
  child.stderr.on('data',data=>{logs+=data.toString();if(logs.length>20000)logs=logs.slice(-10000);});
  for(const [signal,handler] of signals)process.on(signal,handler);
  await guard(new Promise(resolve=>child.once('spawn',resolve)));
  for(let i=0;i<frameCount;i++){
   check();
   const bytes=frame(i);
   await guard(new Promise((resolve,reject)=>child.stdin.write(bytes,error=>error?reject(error):resolve())));
  }
  await guard(new Promise((resolve,reject)=>child.stdin.end(error=>error?reject(error):resolve())));
  await guard(closed);
  check();
  if(fs.statSync(temporary).size===0)throw Error('ffmpeg produced an empty video');
  fs.renameSync(temporary,file);
 }catch(error){
  if(child){
   child.stdin.destroy();
   if(child.exitCode===null&&child.signalCode===null){
    child.kill();
    killTimer=setTimeout(()=>child.kill('SIGKILL'),2000);
    killTimer.unref();
   }
   await closed;
  }
  throw Error(`Video encoding stopped: ${error.message}\n${logs}`,{cause:error});
 }finally{
  clearTimeout(killTimer);
  for(const [signal,handler] of signals)process.removeListener(signal,handler);
  fs.rmSync(temporary,{force:true});
 }
}
