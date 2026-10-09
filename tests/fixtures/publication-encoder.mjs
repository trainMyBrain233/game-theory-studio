#!/usr/bin/env node
import fs from 'node:fs';
if(process.argv.includes('-version'))process.exit(0);
const file=process.argv.at(-1),mode=process.env.ENCODER_MODE;
fs.writeFileSync(file,'partial video');
fs.writeFileSync(process.env.ENCODER_RECORD,JSON.stringify(process.argv.slice(2)));
if(mode==='signal')process.kill(process.pid,'SIGTERM');
else if(mode==='early')process.exit(0);
else if(mode==='epipe'){process.stdin.destroy();setTimeout(()=>process.exit(7),20);}
else if(mode==='interrupt'){
 process.on('SIGTERM',()=>{}); // Exercise the bounded kill escalation on cancellation.
 process.kill(process.ppid,'SIGTERM');
 setInterval(()=>{},1000);
}else{
 process.stdin.resume();
 process.stdin.on('end',()=>{
  if(mode==='fail'){process.stderr.write('intentional disk/encode failure');process.exitCode=8;}
  else fs.writeFileSync(file,mode==='empty'?'':'complete video');
 });
}
