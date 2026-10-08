import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {sceneData} from '../../../production/src/model.mjs';
import {prepareAssets,card,C,tx,line,round} from '../../../production/src/primitives.mjs';
import {CAMERA,TABLE} from './layout.mjs';
import {DEMO,demoState} from './interaction.mjs';
import {presentationModel} from './presentation.mjs';
if(process.argv.slice(2).join(' ')!=='--placeholder-cast')throw Error('Only --placeholder-cast is supported.');
await prepareAssets(2);
const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'artifacts/tabletop-interaction'),frames=path.join(out,'frames');fs.mkdirSync(frames,{recursive:true});
const view=presentationModel(JSON.parse(fs.readFileSync(new URL('./presentation.json',import.meta.url),'utf8')),sceneData),figures={};
for(const id of ['a','b']){
 let svg=fs.readFileSync(path.join(root,`production/assets/person_${id}.svg`),'utf8');
 for(const group of ['upper-arms','forearms','forearm-details','cuffs','hands'])svg=svg.replace(new RegExp(`<g id="${group}"[\\s\\S]*?<\\/g>`),'');
 svg=svg.replace(/<(circle|rect) id="identity-badge"[^>]*\/>/,'');figures[id]=await loadImage(Buffer.from(svg));
}
function polygon(c,points,fill){c.beginPath();c.moveTo(...points[0]);for(const p of points.slice(1))c.lineTo(...p);c.closePath();c.fillStyle=fill;c.fill();c.lineWidth=3;c.strokeStyle=C.ink;c.stroke();}
function limb(c,from,to,color){c.save();c.lineCap='round';c.lineWidth=36;c.strokeStyle=C.ink;c.beginPath();c.moveTo(...from);c.lineTo(...to);c.stroke();c.lineWidth=30;c.strokeStyle=color;c.stroke();c.restore();}
function hand(c,arm,front){
 c.save();c.translate(...arm.wrist);c.scale(arm.side,1);
 if(!front){round(c,-4,-10,27,20,7,C.paper,C.ink,2);round(c,13-8*(1-arm.close),5,17,9,4,C.paper,C.ink,2);}
 else for(let i=0;i<3;i++)round(c,12-20*(1-arm.close),-8+i*(7+3*(1-arm.close)),16,4,2,C.paper,C.ink,1.5);
 c.restore();
}
function draw(c,state){
 c.fillStyle=C.paper;c.fillRect(0,0,1920,1080);
 tx(c,'原创几何取放验证 · 真实手图未接入',84,84,33,700);
 tx(c,view.headerLines[0],1836,54,27,400,C.muted,'right');tx(c,`${view.headerLines[1]}（候选）`,1836,96,31,700,C.ink,'right');line(c,84,116,1836,116,C.light,1.5);
 tx(c,'先夹住，再抬牌；先放稳，再松手',84,213,60,700);tx(c,'同一张牌 / 同一腕点 / 前后手层夹牌 / 明确牌槽承托',84,277,33,400,C.muted);
 for(const [id,p] of Object.entries(CAMERA.actors)){c.drawImage(figures[id.toLowerCase()],p.x,p.y,420*p.scale,500*p.scale);tx(c,view.actors[id].name,p.x+210*p.scale,p.y-2,36,700,C.ink,'center');}
 polygon(c,[[TABLE.backLeft,TABLE.backY],[TABLE.backRight,TABLE.backY],[TABLE.frontRight,TABLE.frontY],[TABLE.frontLeft,TABLE.frontY]],C.faint);
 polygon(c,[[TABLE.frontLeft,TABLE.frontY],[TABLE.frontRight,TABLE.frontY],[TABLE.frontRight,TABLE.frontBottom],[TABLE.frontLeft,TABLE.frontBottom]],C.paper);
 for(const x of [495,1420]){round(c,x-135,891,270,20,3,C.paper,C.ink,3);line(c,x-125,906,x+125,906,C.ink,3);}
 // Explicit slots; no parent/property enumeration controls z order.
 for(const arm of state.arms){const color=arm.actor==='A'?'#E5EDF4':'#F2E7CE';limb(c,arm.shoulder,arm.elbow,color);limb(c,arm.elbow,arm.wrist,color);hand(c,arm,false);}
 for(const item of state.cards)card(c,item.kind,item.x,item.y,item.width);
 for(const arm of state.arms){hand(c,arm,true);c.save();c.translate(...arm.wrist);c.rotate(Math.atan2(arm.wrist[1]-arm.elbow[1],arm.wrist[0]-arm.elbow[0]));round(c,-18,-17,13,34,3,C.paper,C.ink,2);c.restore();}
 for(const x of [495,1420])round(c,x-135,906,270,7,2,C.ink,null);
 const phase={idle:'放松停留',approach:'靠近',contact:'接触闭合',hold:'夹持抬起',place:'落放并停稳',release:'牌交桌面后松指',retreat:'手退回桌面'}[state.phase];
 line(c,84,969,1836,969,C.light,1.5);tx(c,`${state.time.toFixed(1)}s · ${phase}`,84,1019,34,700);tx(c,'几何动作示意；真实握姿、腕缝与自然度未验',1836,1019,31,400,C.muted,'right');
}
const checkpoints=new Set([0,29,30,65,66,79,80,143,144,185,186,199,200,218,219,263,264,299]),states=[];
for(let frame=0;frame<DEMO.duration*DEMO.fps;frame++){
 const canvas=createCanvas(1920,1080),state=demoState(frame/DEMO.fps,{scene:view.scene,camera:CAMERA});draw(canvas.getContext('2d'),state);fs.writeFileSync(path.join(frames,`${String(frame).padStart(4,'0')}.png`),canvas.toBuffer('image/png'));if(checkpoints.has(frame))states.push({frame,...state});
}
const movie=path.join(out,'original-tabletop-cycle.mp4');
const encode=spawnSync('ffmpeg',['-v','error','-y','-framerate',String(DEMO.fps),'-i',path.join(frames,'%04d.png'),'-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',movie],{encoding:'utf8'});if(encode.status!==0)throw Error(`FFmpeg failed: ${encode.stderr}`);
const decode=spawnSync('ffmpeg',['-v','error','-i',movie,'-f','null','-'],{encoding:'utf8'});if(decode.status!==0)throw Error(`Full decode failed: ${decode.stderr}`);
fs.writeFileSync(path.join(out,'review.json'),JSON.stringify({sourceCommit:spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim(),workingTreeDirty:Boolean(spawnSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).stdout.trim()),status:'original_geometry_only',privateArtLinked:false,playbackReview:'pending',fps:DEMO.fps,duration:DEMO.duration,encodedAndFullyDecoded:true,checkpoints:states},null,2)+'\n');
fs.writeFileSync(path.join(out,'review.html'),'<!doctype html><meta charset="utf-8"><title>桌牌动作原型</title><style>body{margin:24px;background:#FFFEF8;color:#243E66;font:20px sans-serif}video{width:100%;max-width:1280px}button{padding:12px;font-size:20px}</style><h1>原创几何取放：真实手图与自然度未验</h1><video id="movie" controls preload="auto" src="original-tabletop-cycle.mp4"></video><p id="reviewStatus">待播放</p><button onclick="movie.currentTime=0;movie.playbackRate=1;movie.play()">从头原速播放</button><script>const movie=document.getElementById("movie"),reviewStatus=document.getElementById("reviewStatus");movie.addEventListener("timeupdate",()=>reviewStatus.textContent=`${movie.currentTime.toFixed(2)} / ${movie.duration.toFixed(2)}s，速度 ${movie.playbackRate}，结束 ${movie.ended}`);movie.addEventListener("ended",()=>reviewStatus.textContent="完整播放结束，1×；真实手姿未验")</script>');
console.log('Wrote 300 native frames and 10s original geometric cycle; FFmpeg encode/full decode passed. Playback review remains pending.');
