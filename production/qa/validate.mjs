import fs from 'node:fs';
import {createCanvas} from '@napi-rs/canvas';
import {drawFrame,DURATION,timeline,content} from '../src/scenes.mjs';
import {CAST} from '../src/cast.mjs';
import {prepareAssets,records,routes,getActorMask} from '../src/primitives.mjs';
if(process.argv.includes('--stress-cast')){CAST.actors.A.display_name='普通僵尸';CAST.actors.B.display_name='路障僵尸';}
await prepareAssets(1.15);const canvas=createCanvas(1920,1080);
function hits(a,b,r,pad=8){const x0=r.x-pad,y0=r.y-pad,x1=r.x+r.width+pad,y1=r.y+r.height+pad;let u=0,v=1;const dx=b[0]-a[0],dy=b[1]-a[1];const ps=[-dx,dx,-dy,dy],qs=[a[0]-x0,x1-a[0],a[1]-y0,y1-a[1]];for(let i=0;i<4;i++){if(ps[i]===0){if(qs[i]<0)return false;}else{const z=qs[i]/ps[i];if(ps[i]<0)u=Math.max(u,z);else v=Math.min(v,z);if(u>v)return false;}}return true}
const overlaps=(a,b,pad=0)=>a.x<a.x+1&&a.x<b.x+b.width+pad&&a.x+a.width+pad>b.x&&a.y<b.y+b.height+pad&&a.y+a.height+pad>b.y;
const semanticErrors=[];for(const [i,key] of ['RR','RB','BR','BB'].entries()){const actual=timeline.visual_contract.matrix_values[key],expected=content.matrix.values[Math.floor(i/2)][i%2];if(JSON.stringify(actual)!==JSON.stringify(expected))semanticErrors.push({key,actual,expected});}if(semanticErrors.length)throw new Error('Matrix content/timeline mismatch: '+JSON.stringify(semanticErrors));
const uniqueTexts=new Set();
let issues=[],samples=0,textCount=0,routeCount=0,minSize=1e9;
const ts=new Set();for(let t=0;t<DURATION;t+=(process.argv.includes('--all-frames')?1/30:.5))ts.add(+t.toFixed(3));
// Follow every semantic boundary when narration is retimed; do not retain old
// absolute-second transition samples after an edited speech window.
const anchors=new Set([...timeline.segments.map(s=>s.start),...timeline.sections.map(s=>s.end)]);
for(const t of anchors)for(let d=-.45;d<1.7;d+=.1)ts.add(+(t+d).toFixed(3));
for(const t of [...ts].sort((a,b)=>a-b)){if(t<0||t>=DURATION)continue;drawFrame(canvas,t);samples++;for(const r of records)uniqueTexts.add(r.text);textCount+=records.length;routeCount+=routes.length;const visible=records.filter(r=>r.alpha>.12);for(const r of visible){minSize=Math.min(minSize,r.size);if(r.x<63||r.y<40||r.x+r.width>1857||r.y+r.height>1059)issues.push({kind:'safe_bounds',t,text:r.text,box:r});}
 const am=getActorMask();if(am){const ac=am.getContext('2d');for(const r of visible){const x=Math.max(0,Math.floor(r.x-8)),y=Math.max(0,Math.floor(r.y-8)),w=Math.min(1920-x,Math.ceil(r.width+16)),h=Math.min(1080-y,Math.ceil(r.height+16));if(w<=0||h<=0)continue;const data=ac.getImageData(x,y,w,h).data;let n=0;for(let a=3;a<data.length;a+=4)if(data[a]>40)n++;if(n)issues.push({kind:'actor_text_clearance',t,text:r.text,pixels:n});}}
 for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){const a=visible[i],b=visible[j];if(overlaps(a,b,2))issues.push({kind:'text_overlap',t,a:a.text,b:b.text});}
 for(const route of routes.filter(r=>r.alpha>.15))for(const r of visible){if(hits(route.from,route.to,r,8+route.width/2))issues.push({kind:'line_text_clearance',t,text:r.text,line:route});}
}
const report={status:issues.length?'needs_revision':'passed',samples,text_draws:textCount,paths:routeCount,main_text_min_size:minSize,text_inventory:[...uniqueTexts].sort(),issues};fs.writeFileSync(new URL(process.argv.includes('--stress-cast')?'checks_long_names.json':'checks.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,text_inventory:undefined,issues:issues.slice(0,30)},null,2));

if(issues.length)process.exitCode=1;
