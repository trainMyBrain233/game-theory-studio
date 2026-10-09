import fs from 'node:fs';
import {layoutPlanIdentity,layoutShardTimes} from './layout-report.mjs';
import {createLayoutSamples} from './layout-samples.mjs';
import {layoutMode,createActorAlphaAudit,expectsActorPixels} from './layout-mode.mjs';
import {createCanvas} from '@napi-rs/canvas';
import {drawFrame,DURATION,timeline,content} from '../src/scenes.mjs';
import {CAST} from '../src/cast.mjs';
import {prepareAssets,records,routes,getActorMask} from '../src/primitives.mjs';
import {TOKENS} from '../src/model.mjs';
import {actorTextClearance} from './actor-clearance.mjs';
if(process.argv.includes('--stress-cast')){CAST.actors.A.display_name='普通僵尸';CAST.actors.B.display_name='路障僵尸';}
const mode=layoutMode(process.argv.slice(2));
if(mode.placeholder&&!process.argv.includes('--placeholder-cast'))process.argv.push('--placeholder-cast');
const sampling=createLayoutSamples({...timeline,duration:DURATION},{fps:TOKENS.canvas?.fps??30,allFrames:process.argv.includes('--all-frames')});
const [shardIndex,shardCount]=(process.env.EPISODE_LAYOUT_SHARD??'0/1').split('/').map(Number);
const planId=layoutPlanIdentity(sampling),sampleTimes=layoutShardTimes(sampling,shardIndex,shardCount);
if(process.env.EPISODE_LAYOUT_PLAN_ID&&process.env.EPISODE_LAYOUT_PLAN_ID!==planId)throw Error('Layout sampling plan mismatch between parent and renderer.');
await prepareAssets(1.15);const canvas=createCanvas(1920,1080);
const alphaAudit=createActorAlphaAudit({required:mode.actorAlpha,width:canvas.width,height:canvas.height});
function hits(a,b,r,pad=8){const x0=r.x-pad,y0=r.y-pad,x1=r.x+r.width+pad,y1=r.y+r.height+pad;let u=0,v=1;const dx=b[0]-a[0],dy=b[1]-a[1];const ps=[-dx,dx,-dy,dy],qs=[a[0]-x0,x1-a[0],a[1]-y0,y1-a[1]];for(let i=0;i<4;i++){if(ps[i]===0){if(qs[i]<0)return false;}else{const z=qs[i]/ps[i];if(ps[i]<0)u=Math.max(u,z);else v=Math.min(v,z);if(u>v)return false;}}return true}
const overlaps=(a,b,pad=0)=>a.x<a.x+1&&a.x<b.x+b.width+pad&&a.x+a.width+pad>b.x&&a.y<b.y+b.height+pad&&a.y+a.height+pad>b.y;
const semanticErrors=[];for(const [i,key] of ['RR','RB','BR','BB'].entries()){const actual=timeline.visual_contract.matrix_values[key],expected=content.matrix.values[Math.floor(i/2)][i%2];if(JSON.stringify(actual)!==JSON.stringify(expected))semanticErrors.push({key,actual,expected});}if(semanticErrors.length)throw new Error('Matrix content/timeline mismatch: '+JSON.stringify(semanticErrors));
const uniqueTexts=new Set();
let issues=[],samples=0,textCount=0,routeCount=0,minSize=1e9;
const renderedTimes=[];
for(const t of sampleTimes){renderedTimes.push(t);drawFrame(canvas,t);samples++;if(samples%10===0)globalThis.gc?.();for(const r of records)uniqueTexts.add(r.text);textCount+=records.length;routeCount+=routes.length;const visible=records.filter(r=>r.alpha>0);for(const r of visible){minSize=Math.min(minSize,r.size);if(r.x<63||r.y<40||r.x+r.width>1857||r.y+r.height>1059)issues.push({kind:'safe_bounds',t,text:r.text,box:r});}
 const am=getActorMask();alphaAudit.inspect(am,{expected:expectsActorPixels(t,timeline),t});if(am)for(const r of visible){const clearance=actorTextClearance(am,r,TOKENS.spacing);alphaAudit.checked();if(clearance.pixels)issues.push({kind:'actor_text_clearance',t,text:r.text,role:r.role,...clearance});}
 for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){const a=visible[i],b=visible[j];if(overlaps(a,b,2))issues.push({kind:'text_overlap',t,a:a.text,b:b.text});}
 for(const route of routes.filter(r=>r.alpha>0))for(const r of visible){if(hits(route.from,route.to,r,8+route.width/2))issues.push({kind:'line_text_clearance',t,text:r.text,line:route});}
}
const actor_alpha=alphaAudit.finish({partial:shardCount>1});
const report={actor_alpha,shard:{index:shardIndex,count:shardCount,plan_id:planId,sample_times:renderedTimes},sampling:{max_step_seconds:sampling.maxStep,fps:sampling.fps,transition_intervals:sampling.intervals},status:issues.length?'needs_revision':'passed',samples,text_draws:textCount,paths:routeCount,main_text_min_size:minSize,text_inventory:[...uniqueTexts].sort(),issues};fs.writeFileSync(process.env.EPISODE_LAYOUT_REPORT??new URL(process.argv.includes('--stress-cast')?'checks_long_names.json':'checks.json',import.meta.url),JSON.stringify(report,null,2));if(!process.env.EPISODE_LAYOUT_REPORT)console.log(JSON.stringify({...report,text_inventory:undefined,issues:issues.slice(0,30)},null,2));

if(issues.length)process.exitCode=1;
