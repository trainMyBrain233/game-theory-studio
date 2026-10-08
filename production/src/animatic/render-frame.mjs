/** Fixed public component harness, not the private episode compositor. */
import '../../../scripts/isolated-fonts.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas} from '@napi-rs/canvas';
import {canvasFont,FONT_FAMILY} from '../../../typography/fonts.mjs';
import {assertAppliedFont} from '../../../typography/font-contract.mjs';
import {compilePlan,resolveFrame,CELLS,deepFreeze} from './semantic-state.mjs';
import {prepareVerifiedAnimaticFonts,registerVerifiedAnimaticFonts} from './font-resources.mjs';
import {validateAvatarAdapter,alphaInkBounds,createAvatarTransition,sampleAvatarTransition,drawAvatarSample} from './avatar.mjs';

export const PUBLIC_GEOMETRY=deepFreeze({width:1920,height:1080,matrix:{x:740,y:430,width:940,height:340},subtitle:{singleY:1018,twoY:988,lineHeight:52,size:40}});
export const TEXT_SLOTS=deepFreeze({
 header:{x:84,y:24,width:1752,height:88},information:{x:84,y:126,width:1752,height:68},
 'name:A':{x:340,y:448,width:240,height:88},'name:B':{x:1160,y:238,width:640,height:80},
 'row:red':{x:575,y:480,width:150,height:65},'row:blue':{x:575,y:650,width:150,height:65},
 'column:red':{x:755,y:335,width:440,height:80},'column:blue':{x:1225,y:335,width:440,height:80},
 legend:{x:740,y:808,width:940,height:76},subtitle:{x:180,y:948,width:1560,height:120}
});
export const COLORS=deepFreeze({paper:'#FFFEF8',ink:'#243E66',line:'#BDCDE0',faint:'#EAF0F7',red:'#BC3D31',blue:'#345D9E'});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const pose=(x,y,side)=>({x,y,scale:.8,side,alpha:1});
export const PUBLIC_AVATAR_TRACKS=deepFreeze({
 A:{startFrame:0,endFrame:50,from:pose(120,430,1),to:pose(220,430,1)},
 B:{startFrame:0,endFrame:50,from:pose(1050,230,-1),to:pose(970,230,-1)}
});
function drawText(contexts,records,text,x,y,size,{role='body',align='left',weight=700,color=COLORS.ink,fontFamily=FONT_FAMILY}={}) {
 let metrics,applied;
 const requestedFont=fontFamily===FONT_FAMILY?canvasFont(size,weight):`${weight} ${size}px "${fontFamily}"`;
 for(const ctx of contexts){ctx.save();try{ctx.font=requestedFont;applied=assertAppliedFont(ctx,{size,weight,family:fontFamily});ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='alphabetic';metrics=ctx.measureText(text);ctx.fillText(text,x,y);}finally{ctx.restore();}}
 const record={text,role,font:applied.font,size:applied.size,weight:applied.weight,family:applied.family,x:x-metrics.actualBoundingBoxLeft,y:y-metrics.actualBoundingBoxAscent,width:metrics.actualBoundingBoxLeft+metrics.actualBoundingBoxRight,height:metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent};
 const slot=TEXT_SLOTS[role]||{x:0,y:0,width:1920,height:1080};
 assert(record.x>=slot.x && record.y>=slot.y && record.x+record.width<=slot.x+slot.width && record.y+record.height<=slot.y+slot.height,`Text layout slot overflow: ${role}; ${applied.size}px; measured ink ${record.width}x${record.height}px at ${record.x},${record.y}; slot ${slot.width}x${slot.height}px at ${slot.x},${slot.y}`);
 for(const other of records){const dx=Math.min(record.x+record.width,other.x+other.width)-Math.max(record.x,other.x),dy=Math.min(record.y+record.height,other.y+other.height)-Math.max(record.y,other.y);assert(dx<=0||dy<=0,`Text ink bounds overlap: ${role} and ${other.role}; ${dx}x${dy}px`);}
 records.push(record);
}
export function drawResolvedSubtitle(ctx,textContext,records,state,fontFamily=FONT_FAMILY) {
 const lines=state.caption.lines,g=PUBLIC_GEOMETRY.subtitle;
 for(const [index,line] of lines.entries())drawText([ctx,textContext],records,line,960,lines.length===1?g.singleY:g.twoY+index*g.lineHeight,g.size,{fontFamily,role:'subtitle',align:'center'});
}
export function drawResolvedMatrix(ctx,textContext,records,state,caseData,fontFamily=FONT_FAMILY) {
 const {x,y,width,height}=PUBLIC_GEOMETRY.matrix,cw=width/2,ch=height/2;
 for(const [index,cell] of CELLS.entries()){
  const row=Math.floor(index/2),column=index%2,left=x+column*cw,top=y+row*ch;
  ctx.fillStyle=state.activeCell===cell || state.rowFocus===(row===0?'red':'blue')?COLORS.faint:COLORS.paper;ctx.fillRect(left,top,cw,ch);
  ctx.strokeStyle=COLORS.line;ctx.lineWidth=2;ctx.strokeRect(left,top,cw,ch);
  const values=state.revealedScores[cell];
  for(const [owner,value] of values.entries())if(value!==null)drawText([ctx,textContext],records,String(value),left+cw/2+(owner===0?-62:62),top+ch/2+24,64,{fontFamily,role:`score:${cell}:${owner}`,align:'center'});
  if(values.every(value=>value!==null))drawText([ctx,textContext],records,'，',left+cw/2,top+ch/2+24,56,{fontFamily,role:`comma:${cell}`,align:'center',weight:400});
  if(state.activeCell===cell){ctx.strokeStyle=COLORS.ink;ctx.lineWidth=5;ctx.strokeRect(left+5,top+5,cw-10,ch-10);}
 }
 for(const [index,key] of ['red','blue'].entries()){
  drawText([ctx,textContext],records,caseData.strategies[key],x+cw*(index+.5),388,36,{fontFamily,role:`column:${key}`,align:'center',color:COLORS[key]});
  drawText([ctx,textContext],records,caseData.strategies[key],650,y+ch*(index+.5)+13,36,{fontFamily,role:`row:${key}`,align:'center',color:COLORS[key]});
 }
 drawText([ctx,textContext],records,caseData.players.A.name,360,500,36,{fontFamily,role:'name:A'});
 drawText([ctx,textContext],records,caseData.players.B.name,1180,290,36,{fontFamily,role:'name:B'});
 drawText([ctx,textContext],records,`数对顺序：${caseData.players.A.name}，${caseData.players.B.name}`,1210,855,30,{fontFamily,role:'legend',align:'center'});
}
function snapshotAdapter(adapter,id) {
 validateAvatarAdapter(adapter);assert.equal(adapter.id,id,'Avatar adapter actor identity must match its requested role');
 assert(adapter.width<=4096 && adapter.height<=4096,'Avatar native dimensions exceed the supported test contract');
 // Provider code may retain its context/canvas. Never use that exposed surface
 // as the session asset: copy pixels into a second, strictly private surface.
 const exposed=createCanvas(adapter.width,adapter.height);adapter.draw(exposed.getContext('2d'));
 const image=createCanvas(exposed.width,exposed.height);
 image.getContext('2d').putImageData(exposed.getContext('2d').getImageData(0,0,exposed.width,exposed.height),0,0);
 exposed.width=1;exposed.height=1;
 const actual=alphaInkBounds(image);assert.deepEqual(actual,adapter.alphaBounds,'Adapter alphaBounds must match every nonzero source pixel');
 const bytes=image.getContext('2d').getImageData(0,0,image.width,image.height).data;
 const captured=Object.freeze({id,width:image.width,height:image.height,alphaBounds:actual,draw:ctx=>ctx.drawImage(image,0,0)});
 return {adapter:captured,fingerprint:{id,width:image.width,height:image.height,alphaBounds:actual,rgbaSha256:hash(bytes)}};
}
/**
 * Capture plan/case, geometry, exact font bytes and actual provider pixels once.
 * Mutating a caller's plan/provider later cannot alter this session. For any
 * changed input create a new session/cache. No output files are written.
 */
export function createRenderSession({plan,adapters,title='公共动画组件测试',tracks=PUBLIC_AVATAR_TRACKS}={}) {
 assert(typeof title==='string' && title.isWellFormed() && title.trim()===title && title.length>0 && !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/u.test(title),'Session title must be nonempty, trimmed, single-line and free of invisible controls');
 assert(adapters && Object.keys(adapters).sort().join(',')==='A,B','Exactly A and B avatar adapters are required');
 assert(tracks && Object.keys(tracks).sort().join(',')==='A,B','Exactly A and B avatar tracks are required');
 const compiled=compilePlan(plan);
 const displayed=[title,'0123456789，','数对顺序：','选牌时：看不到对方选择','正在一起亮牌','亮牌后：双方可见',
  ...Object.values(compiled.plan.caseData.players).map(player=>player.name),...Object.values(compiled.plan.caseData.strategies),
  ...compiled.plan.blocks.map(block=>block.voiceover),...compiled.phases.flatMap(phase=>phase.lines)];
 const fontResources=registerVerifiedAnimaticFonts(prepareVerifiedAnimaticFonts(displayed)),fontFamily=fontResources.family;
 const captures=Object.fromEntries(['A','B'].map(id=>[id,snapshotAdapter(adapters[id],id)]));
 const transitions=Object.fromEntries(['A','B'].map(id=>[id,createAvatarTransition(tracks[id])]));
 for(const track of Object.values(transitions))assert(track.endFrame<compiled.plan.durationFrames,'Avatar transition must complete inside the render range');
 const fonts=fontResources.fonts;
 const fingerprint=hash(JSON.stringify({version:'public-components-v1',plan:compiled.plan,geometry:PUBLIC_GEOMETRY,textSlots:TEXT_SLOTS,title,tracks:transitions,fonts,fontResourceFingerprint:fontResources.fingerprint,family:fontFamily,assets:Object.values(captures).map(value=>value.fingerprint)}));
 function render(frame){
  fontResources.assertUnchanged();
  const state=resolveFrame(compiled,frame),canvas=createCanvas(1920,1080),ctx=canvas.getContext('2d');
  const textMask=createCanvas(1920,1080),textContext=textMask.getContext('2d'),avatarMask=createCanvas(1920,1080),avatarContext=avatarMask.getContext('2d'),textRecords=[];
  try{
  ctx.fillStyle=COLORS.paper;ctx.fillRect(0,0,1920,1080);
  drawText([ctx,textContext],textRecords,title,84,80,42,{fontFamily,role:'header'});
  const informationLabel={hidden:'选牌时：看不到对方选择',revealing:'正在一起亮牌',visible:'亮牌后：双方可见'}[state.information.phase];
  drawText([ctx,textContext],textRecords,informationLabel,84,170,33,{fontFamily,role:'information'});
  for(const [index,owner] of ['A','B'].entries()){
   const key=state.information.choices?.[owner];
   const left=84+index*130;ctx.fillStyle=COLORS.faint;ctx.fillRect(left,210,90,120);
   if(key){ctx.save();ctx.globalAlpha=state.information.revealProgress;ctx.fillStyle=COLORS[key];ctx.fillRect(left,210,90,120);ctx.restore();}
  }
  drawResolvedMatrix(ctx,textContext,textRecords,state,compiled.plan.caseData,fontFamily);
  const avatarRecords=[];
  for(const id of ['A','B']){
   const sample=sampleAvatarTransition(transitions[id],frame),adapter=captures[id].adapter;
   const bounds=drawAvatarSample(ctx,adapter,sample);drawAvatarSample(avatarContext,adapter,sample);avatarRecords.push({id,sample,bounds});
  }
  // Captions are outside every scene/transition opacity group, including tails.
  drawResolvedSubtitle(ctx,textContext,textRecords,state,fontFamily);
  return {canvas,state,textMask,avatarMask,textRecords,avatarRecords,dispose:()=>{for(const surface of [canvas,textMask,avatarMask]){surface.width=1;surface.height=1;}}};
  }catch(error){for(const surface of [canvas,textMask,avatarMask]){surface.width=1;surface.height=1;}throw error;}
 }
 return Object.freeze({fingerprint,fontFamily,durationFrames:compiled.plan.durationFrames,assertResourcesUnchanged:fontResources.assertUnchanged,render,renderPNG:frame=>{const result=render(frame);try{return result.canvas.toBuffer('image/png');}finally{result.dispose();}}});
}
