import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createCanvas} from '@napi-rs/canvas';
import {sceneData,timeline} from '../../../production/src/model.mjs';
import {prepareAssets,card,C,tx,round,line} from '../../../production/src/primitives.mjs';
import {VARIANTS,TABLE,CAMERA,tabletopState,interactionSchedule,flatRegressionWindow} from './layout.mjs';
import {presentationModel} from './presentation.mjs';
import {drawAvatar} from './avatar.mjs';
import {loadPublicCast} from './public-cast.mjs';
import {drawIdentityMatrix} from './identity-matrix.mjs';
import {DISPLAY_TEXT,candidateHeader,comparisonHeading,tabletopStatus} from './display-text.mjs';
const args=process.argv.slice(2);
if(args[0]!=='--placeholder-cast'||args.length>2||(args.length===2&&args[1]!=='--flat-regression'))throw Error('This prototype accepts only explicit --placeholder-cast; no external character layers are loaded.');
await prepareAssets(2);
const root=path.resolve(import.meta.dirname,'../../..'),output=path.join(root,'artifacts/tabletop-prototype');fs.mkdirSync(output,{recursive:true});
const presentation=presentationModel(JSON.parse(fs.readFileSync(new URL('./presentation.json',import.meta.url),'utf8')),sceneData);
const {arms,figures,avatars}=await loadPublicCast();
function avatar(c,id,x,y,size){return drawAvatar(c,avatars[id],id,{x,y,size,padding:Math.max(2,size/16)});}
function figure(c,id,p){
 c.drawImage(figures[id.toLowerCase()],p.x,p.y,420*p.scale,500*p.scale);
 tx(c,presentation.actors[id].name,p.x+210*p.scale,p.y-2,36,700,C.ink,'center');
 const size=44*p.scale;avatar(c,id,p.x+164*p.scale-size/2,p.y+374*p.scale-size/2,size);
}
function header(c,left){
 tx(c,left,84,84,33,700);
 tx(c,presentation.headerLines[0],1836,54,27,400,C.muted,'right');
 tx(c,candidateHeader(presentation),1836,96,31,700,C.ink,'right');
 line(c,84,116,1836,116,C.light,1.5);
}
function polygon(c,points,fill,stroke=C.ink,width=3){c.beginPath();c.moveTo(...points[0]);for(const p of points.slice(1))c.lineTo(...p);c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.lineWidth=width;c.strokeStyle=stroke;c.stroke();}}
function tabletop(c){
 polygon(c,[[TABLE.backLeft,TABLE.backY],[TABLE.backRight,TABLE.backY],[TABLE.frontRight,TABLE.frontY],[TABLE.frontLeft,TABLE.frontY]],C.faint);
 polygon(c,[[TABLE.frontLeft,TABLE.frontY],[TABLE.frontRight,TABLE.frontY],[TABLE.frontRight,TABLE.frontBottom],[TABLE.frontLeft,TABLE.frontBottom]],C.paper);
}
function rail(c,x,width){
 polygon(c,[[x-width/2+8,900],[x+width/2-8,900],[x+width/2,910],[x-width/2,910]],C.paper);
 round(c,x-width/2,900,width,10,2,C.faint,C.ink,2.5);line(c,x-width/2+8,906,x+width/2-8,906,C.ink,3);
}
function draw(c,state){
 c.fillStyle=C.paper;c.fillRect(0,0,1920,1080);
 header(c,DISPLAY_TEXT.tabletopHeader);
 const variant=VARIANTS.find(v=>v.id===state.variant);
 tx(c,variant.title,84,213,65,700);tx(c,variant.note,84,277,33,400,C.muted);
 for(const [id,p] of Object.entries(CAMERA.actors)){
  figure(c,id,p);
 }
 // Deliberate depth: torso behind opaque tabletop; original forearms in front.
 tabletop(c);for(const [id,p] of Object.entries(CAMERA.actors))c.drawImage(arms[id.toLowerCase()],p.x,p.y,420*p.scale,500*p.scale);
 if(state.variant==='shared-rail')for(const x of [495,1420])rail(c,x,270);
 if(state.variant==='separate-stands')for(const x of [430,560,1354,1484])rail(c,x,76);
 for(const item of state.cards){if(item.alpha<.01)continue;c.save();c.globalAlpha=item.alpha;
  if(item.flat>.01){c.save();c.translate(item.x,item.y);c.scale(1,1-item.flat*.72);card(c,item.kind,0,0,item.width,{label:false});c.restore();tx(c,item.label,item.x,item.bottom+39,31,700,C.ink,'center',{record:false});}
  else card(c,item.kind,item.x,item.y,item.width);
  if(item.chosen&&state.raised>.1){const [x,y]=item.proposedCardContact;c.beginPath();c.arc(x,y,7,0,Math.PI*2);c.strokeStyle=C.muted;c.lineWidth=2;c.setLineDash([3,3]);c.stroke();}
  c.restore();
 }
 if(state.variant==='shared-rail')for(const x of [495,1420])round(c,x-135,906,270,5,1,C.ink,null);
 if(state.variant==='separate-stands')for(const x of [430,560,1354,1484])round(c,x-38,906,76,5,1,C.ink,null);
 line(c,84,969,1836,969,C.light,1.5);
 tx(c,tabletopStatus(state),84,1019,34,700);
 tx(c,DISPLAY_TEXT.supportNote,1836,1019,31,400,C.muted,'right');
}
const schedule=interactionSchedule(timeline);
const times=[Math.max(0,schedule.idleEnd-1),schedule.reachEnd+.85,(schedule.placeStart+schedule.contact)/2,(schedule.releaseStart+schedule.releaseEnd)/2],reports=[];
for(const variant of VARIANTS){
 const board=createCanvas(2624,906),b=board.getContext('2d');b.fillStyle=C.paper;b.fillRect(0,0,2624,906);
 tx(b,comparisonHeading(variant),32,57,34,700);
 for(const time of times){
  const canvas=createCanvas(1920,1080),state=tabletopState(variant.id,time,{scene:presentation.scene,timeline});draw(canvas.getContext('2d'),state);
  const name=`${variant.id}_${time.toFixed(1)}.png`;fs.writeFileSync(path.join(output,name),canvas.toBuffer('image/png'));reports.push({...state,image:name});
  if(time===times[0]||time===times[3])b.drawImage(canvas,32+(time===times[0]?0:1312),92,1280,720);
 }
 tx(b,DISPLAY_TEXT.stageNote,32,864,30,400,C.muted);
 fs.writeFileSync(path.join(output,`${variant.id}-comparison.png`),board.toBuffer('image/png'));
}
// Separate identity/layout proof: the same supplied head appears on body and matrix.
const identity=createCanvas(1920,1080),c=identity.getContext('2d');c.fillStyle=C.paper;c.fillRect(0,0,1920,1080);
header(c,DISPLAY_TEXT.identityHeader);
tx(c,DISPLAY_TEXT.identityTitle,84,218,62,700);tx(c,DISPLAY_TEXT.identityNote,84,282,32,400,C.muted);
for(const [id,x] of [['A',110],['B',470]])figure(c,id,{x,y:370,scale:.72});
// Keep the proof-only tabletop clear of the inset lower-row portrait.
polygon(c,[[70,716],[800,716],[840,807],[28,807]],C.faint);polygon(c,[[28,807],[840,807],[840,823],[28,823]],C.paper);
for(const [id,x] of [['a',110],['b',470]])c.drawImage(arms[id],x,370,420*.72,500*.72);
drawIdentityMatrix(c,presentation,avatars);
line(c,84,969,1836,969,C.light,1.5);tx(c,DISPLAY_TEXT.identityFooter,84,1019,34,700);tx(c,DISPLAY_TEXT.identityReviewNote,1836,1019,30,400,C.muted,'right');
fs.writeFileSync(path.join(output,'identity-matrix.png'),identity.toBuffer('image/png'));
fs.writeFileSync(path.join(output,'prototype-manifest.json'),JSON.stringify({status:'prototype',sourceCommit:spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim(),workingTreeDirty:Boolean(spawnSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).stdout.trim()),originalPublicOnly:true,timelineDuration:timeline.duration,times,handArtLinked:false,presentation:{header:presentation.header,headerLines:presentation.headerLines,narrationNames:presentation.narrationNames,status:presentation.status,timingRevision:presentation.timingRevision},reports},null,2)+'\n');
console.log(`Wrote 3 comparison boards, 12 native 1080p original-placeholder frames and 1 identity/matrix proof to ${path.relative(root,output)}. Prototype only; no production render changed.`);

if(args.includes('--flat-regression')){
 const flatOut=path.join(root,'artifacts/tabletop-flat-regression'),frames=path.join(flatOut,'frames');fs.mkdirSync(frames,{recursive:true});
 const clip=flatRegressionWindow(timeline);
 for(let frame=0;frame<clip.frames;frame++){const canvas=createCanvas(1920,1080);draw(canvas.getContext('2d'),tabletopState('flat-rest',clip.start+frame/clip.fps,{scene:presentation.scene,timeline}));fs.writeFileSync(path.join(frames,`${String(frame).padStart(4,'0')}.png`),canvas.toBuffer('image/png'));}
 fs.writeFileSync(path.join(flatOut,'clip-manifest.json'),JSON.stringify({...clip,sourceReachEnd:schedule.reachEnd,status:'prototype',playback:'pending'},null,2)+'\n');
 const movie=path.join(flatOut,'flat-unselected-pose.mp4'),encoded=spawnSync('ffmpeg',['-v','error','-y','-framerate',String(clip.fps),'-i',path.join(frames,'%04d.png'),'-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',movie],{encoding:'utf8'});if(encoded.status!==0)throw Error(encoded.stderr);
 const decoded=spawnSync('ffmpeg',['-v','error','-i',movie,'-f','null','-'],{encoding:'utf8'});if(decoded.status!==0)throw Error(decoded.stderr);
 console.log('Wrote 2s / 60-frame flat pickup regression excerpt; only the chosen card rotates, non-selected fading remains a prototype.');
}
