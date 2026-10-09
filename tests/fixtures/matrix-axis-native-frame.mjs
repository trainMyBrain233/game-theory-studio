import assert from 'node:assert/strict';
import fs from 'node:fs';
import {FONT_FAMILY} from '../../typography/fonts.mjs';
import {createCanvas} from '@napi-rs/canvas';
import {timeline,CAST,resolveCastText} from '../../production/src/model.mjs';
process.argv.push('--placeholder-cast');
if(process.env.AXIS_LONG){CAST.strategies.red.label='共同合作';CAST.strategies.blue.label='各自退出';CAST.actors.A.display_name='明月';CAST.actors.B.display_name='青禾';}
if(process.env.AXIS_LONG_NAMES){CAST.actors.A.display_name='明月同学';CAST.actors.B.display_name='青禾同学';}
for(const id of ['A','B'])assert.equal(resolveCastText('{{'+id+'}}'),CAST.actors[id].display_name,'Fixture owner name must resolve exactly once');
if(process.env.AXIS_TOO_LONG)CAST.strategies.red.label='这是不能缩小的超长策略';
const primitives=await import('../../production/src/primitives.mjs');
await primitives.prepareAssets(1);
const {drawFrame}=await import('../../production/src/scenes.mjs');
const segment=timeline.segments.find(s=>s.id===(process.env.AXIS_SEGMENT??'s23_score_order'));
function auditFrame(offset){
const time=segment.start+(offset===null?(segment.end-segment.start)*Number(process.env.AXIS_FRACTION??.6):offset);
const canvas=createCanvas(1920,1080),context=canvas.getContext('2d'),badges=[],cards=[],actorMask=createCanvas(1920,1080),actorContext=actorMask.getContext('2d');
const nativeArc=context.arc.bind(context),nativeRound=context.roundRect.bind(context);
context.arc=(x,y,r,...args)=>{if((r===24||r===25)&&context.globalAlpha>.01)badges.push({x:x-r,y:y-r,width:r*2,height:r*2});return nativeArc(x,y,r,...args)};
context.roundRect=(x,y,w,h,...args)=>{if((w===48||w===50)&&w===h&&context.globalAlpha>.01)badges.push({x,y,width:w,height:h});return nativeRound(x,y,w,h,...args)};
const nativeDrawImage=context.drawImage.bind(context);
context.drawImage=(asset,x,y,w,h,...rest)=>{
 if([primitives.assets['person-a'],primitives.assets['person-b']].includes(asset)){
  const tr=context.getTransform();actorContext.setTransform(tr.a,tr.b,tr.c,tr.d,tr.e,tr.f);actorContext.globalAlpha=context.globalAlpha;actorContext.drawImage(asset,x,y,w,h,...rest);
 }
 if([primitives.assets['card-red'],primitives.assets['card-blue']].includes(asset)&&context.globalAlpha>.01){
  const tr=context.getTransform(),points=[[x,y],[x+w,y],[x,y+h],[x+w,y+h]].map(([px,py])=>[tr.a*px+tr.c*py+tr.e,tr.b*px+tr.d*py+tr.f]);
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);cards.push({x:Math.min(...xs),y:Math.min(...ys),right:Math.max(...xs),bottom:Math.max(...ys)});
 }
 return nativeDrawImage(asset,x,y,w,h,...rest);
};
drawFrame(canvas,time);
// Preserve native evidence before assertions when reproducing a failing frame.
if(process.env.AXIS_RAW_PROOF){
 const folder=process.env.AXIS_RAW_PROOF;fs.mkdirSync(folder,{recursive:true});
 const name=`${process.env.AXIS_MUTATION??'current'}-${process.env.AXIS_LONG_NAMES?'long-names':process.env.AXIS_LONG?'long':'default'}-${segment.id}-${offset??process.env.AXIS_FRACTION??.6}`;
 fs.writeFileSync(`${folder}/${name}.png`,canvas.toBuffer('image/png'));
 const half=createCanvas(960,540);half.getContext('2d').drawImage(canvas,0,0,960,540);fs.writeFileSync(`${folder}/${name}-960.png`,half.toBuffer('image/png'));
 fs.writeFileSync(`${folder}/${name}.json`,JSON.stringify({time,records:primitives.records,routes:primitives.routes},null,2));
}
const axes=primitives.records.filter(r=>r.role==='matrix-axis');
assert.equal(axes.length,4,'all four row/column axis labels have recorded ink');
// Match episode QA's 8px graphic clearance using native ink and actual
// transformed routes, including the lowest nonzero Canvas alpha.
const hits=(a,b,r,pad)=>{
 const low=[r.x-pad,r.y-pad],high=[r.x+r.width+pad,r.y+r.height+pad];let enter=0,exit=1;
 for(let axis=0;axis<2;axis++){
  const delta=b[axis]-a[axis];
  if(delta===0){if(a[axis]<low[axis]||a[axis]>high[axis])return false;continue;}
  const near=(low[axis]-a[axis])/delta,far=(high[axis]-a[axis])/delta;
  enter=Math.max(enter,Math.min(near,far));exit=Math.min(exit,Math.max(near,far));if(enter>exit)return false;
 }
 return true;
};
if(process.env.AXIS_EXPECT_FAINT_DESK)assert(primitives.routes.some(r=>r.from[0]===230&&r.to[0]===1688&&r.alpha>0&&r.alpha<=1/255),'Expected actual desk route at lowest nonzero alpha');
for(const route of primitives.routes.filter(r=>r.alpha>0))for(const r of primitives.records.filter(r=>r.alpha>0))assert(!hits(route.from,route.to,r,8+route.width/2),`text ink overlaps a ${route.from[1]===route.to[1]?'horizontal':'vertical'} leader (line_text_clearance): ${JSON.stringify({t:time,text:r.text,line:route})}`);
for(const [i,r] of axes.entries()){
 assert(r.size>=30,'meaningful axis font below 30px');
 assert.equal(r.weight,700);assert.equal(r.family,FONT_FAMILY);
 assert.equal(r.text,CAST.strategies[i<2?'red':'blue'].label,'row/column strategy semantics');
 assert(r.width<=132&&r.height>20,'measured native glyph bounds');
 const ink=canvas.getContext('2d').getImageData(Math.floor(r.x),Math.floor(r.y),Math.ceil(r.width),Math.ceil(r.height)).data;
 const actorInk=actorContext.getImageData(Math.floor(r.x),Math.floor(r.y),Math.ceil(r.width),Math.ceil(r.height)).data;assert(![...actorInk].some((v,j)=>j%4===3&&v>0),'axis glyph bounds overlap visible actor alpha');
 assert([...ink].some((v,j)=>j%4!==3&&v<100),'native glyph ink was drawn');
 for(const card of cards)assert(!(r.x<card.right&&r.x+r.width>card.x&&r.y<card.bottom&&r.y+r.height>card.y),'axis glyph ink overlaps a card cue');
 for(const other of primitives.records){
  if(other===r)continue;
  if(other.role==='actor-name'&&other.text===CAST.actors.B.display_name&&r.y<other.y+other.height&&r.y+r.height>other.y)assert(r.x-(other.x+other.width)>=16||other.x-(r.x+r.width)>=16,'column strategy needs 16px separation from owner name');
  assert(!(r.x<other.x+other.width&&r.x+r.width>other.x&&r.y<other.y+other.height&&r.y+r.height>other.y),`axis ${r.text} collides with ${other.text}`);
 }
}
for(const name of primitives.records.filter(r=>r.role==='actor-name'))for(const card of cards)assert(!(name.x<card.right&&name.x+name.width>card.x&&name.y<card.bottom&&name.y+name.height>card.y),'actor name ink overlaps card cue');
for(const name of primitives.records.filter(r=>r.role==='actor-name'))for(const badge of badges)assert(!(name.x<badge.x+badge.width&&name.x+name.width>badge.x&&name.y<badge.y+badge.height&&name.y+name.height>badge.y),'actor name ink overlaps owner badge');
if(process.env.AXIS_PROOF){fs.mkdirSync(process.env.AXIS_PROOF,{recursive:true});const name=`${process.env.AXIS_LONG_NAMES?'long-names':process.env.AXIS_LONG?'long':'default'}-${segment.id}-${offset??process.env.AXIS_FRACTION??.6}`;fs.writeFileSync(`${process.env.AXIS_PROOF}/${name}.png`,canvas.toBuffer('image/png'));const half=createCanvas(960,540);half.getContext('2d').drawImage(canvas,0,0,960,540);fs.writeFileSync(`${process.env.AXIS_PROOF}/${name}-960.png`,half.toBuffer('image/png'));}
console.log(JSON.stringify({time,axes}));
}
const offsets=process.env.AXIS_BATCH_OFFSETS?JSON.parse(process.env.AXIS_BATCH_OFFSETS):[process.env.AXIS_OFFSET===undefined?null:Number(process.env.AXIS_OFFSET)];
assert(Array.isArray(offsets)&&offsets.length>0&&offsets.length<=8,'Bound native batches to eight frames');
const failures=[];
for(const offset of offsets){assert(offset===null||Number.isFinite(offset));try{auditFrame(offset);}catch(error){if(!process.env.AXIS_COLLECT_FAILURES)throw error;failures.push(error.stack);}}
assert.equal(failures.length,0,failures.join('\n\n'));
