import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {pythonCommand} from '../../scripts/python.mjs';
import {timeline,TOKENS} from '../src/model.mjs';
import {createLayoutSamples} from './layout-samples.mjs';
import {layoutPlanIdentity,mergeLayoutReports} from './layout-report.mjs';
import {layoutMode} from './layout-mode.mjs';
const mode=layoutMode(process.argv.slice(2));
const sampling=createLayoutSamples(timeline,{fps:TOKENS.canvas.fps,allFrames:process.argv.includes('--all-frames')});
// Native Canvas retains per-frame resources beyond V8's heap limit. Bound each
// renderer lifetime without dropping any sample; interleave shards so private
// each partition checks its own frames; the parent validates complete evidence.
{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'episode-layout-'));
 let completed=false;
 try{
  const count=Math.ceil(sampling.times.length/100),reports=[];
  for(let index=0;index<count;index++){
   const output=path.join(directory,`${index}.json`);
   const child=spawnSync(process.execPath,[...process.execArgv,'--expose-gc',fileURLToPath(new URL('validate.mjs',import.meta.url)),...process.argv.slice(2)],{encoding:'utf8',env:{...process.env,PYTHON:pythonCommand(),EPISODE_LAYOUT_SHARD:`${index}/${count}`,EPISODE_LAYOUT_PLAN_ID:layoutPlanIdentity(sampling),EPISODE_LAYOUT_REPORT:output}});
   if(child.error||child.signal||![0,1].includes(child.status)||!fs.existsSync(output))throw Error(`Layout shard ${index+1}/${count} failed: ${child.error?.message??child.signal??child.status}\n${child.stderr}`);
   if(child.stdout)process.stdout.write(child.stdout);
   reports.push(JSON.parse(fs.readFileSync(output,'utf8')));
  }
  const report=mergeLayoutReports(reports,{sampling,required:mode.actorAlpha});
  fs.writeFileSync(process.env.EPISODE_LAYOUT_REPORT??new URL(process.argv.includes('--stress-cast')?'checks_long_names.json':'checks.json',import.meta.url),JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,text_inventory:undefined,sampling:{...report.sampling,transition_intervals:report.sampling.transition_intervals.length},issues:report.issues.slice(0,30)},null,2));
  process.exitCode=report.issues.length?1:0;completed=true;
 }finally{if(completed&&!process.env.EPISODE_LAYOUT_KEEP_REPORTS)fs.rmSync(directory,{recursive:true,force:true});else console.error(`Layout shard evidence: ${directory}`);}
}
