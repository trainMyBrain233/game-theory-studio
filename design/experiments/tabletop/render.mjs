import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {sceneData,timeline} from '../../../production/src/model.mjs';
import {prepareAssets,card,C,tx,round,line} from '../../../production/src/primitives.mjs';
import {VARIANTS,TABLE,CAMERA,tabletopState} from './layout.mjs';
import {presentationModel} from './presentation.mjs';
import {headAlphaBounds,drawAvatar} from './avatar.mjs';
const args=process.argv.slice(2);
if(args.length!==1||args[0]!=='--placeholder-cast')throw Error('This prototype accepts only explicit --placeholder-cast; no external character layers are loaded.');
await prepareAssets(2);
const root=path.resolve(import.meta.dirname,'../../..'),output=path.join(root,'artifacts/tabletop-prototype');fs.mkdirSync(output,{recursive:true});
const presentation=presentationModel(JSON.parse(fs.readFileSync(new URL('./presentation.json',import.meta.url),'utf8')),sceneData);
const arms={},figures={},avatars={};
const wrap=groups=>`<svg xmlns="http://www.w3.org/2000/svg" width="840" height="1000" viewBox="0 0 420 500"><g stroke="#243E66" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round">${groups}</g></svg>`;
for(const id of ['a','b']){
 const svg=fs.readFileSync(path.join(root,`production/assets/person_${id}.svg`),'utf8');
 const groups=['forearms','forearm-details','cuffs','hands'].map(name=>svg.match(new RegExp(`<g id="${name}"[\\s\\S]*?<\\/g>`))?.[0]);
 if(groups.some(g=>!g))throw Error('Missing original foreground arm group.');
 arms[id]=await loadImage(Buffer.from(wrap(groups.join(''))));
 figures[id]=await loadImage(Buffer.from(svg.replace(/<(circle|rect) id="identity-badge"[^>]*\/>/,'')));
 const headIds=['hair-back','ears','face','hair','hair-front','hair-strands','brows','glasses','eyes','face-details'];
 const head=headIds.map(name=>svg.match(new RegExp(`<g id="${name}"[\\s\\S]*?<\\/g>`))?.[0]??svg.match(new RegExp(`<path id="${name}"[^>]*\\/>`))?.[0]??'').join('');
 const image=await loadImage(Buffer.from(wrap(head)));avatars[id.toUpperCase()]={actor:id.toUpperCase(),image,bounds:headAlphaBounds(image)};
}
function avatar(c,id,x,y,size){return drawAvatar(c,avatars[id],id,{x,y,size,padding:Math.max(2,size/16)});}
function figure(c,id,p){
 c.drawImage(figures[id.toLowerCase()],p.x,p.y,420*p.scale,500*p.scale);
 tx(c,presentation.actors[id].name,p.x+210*p.scale,p.y-2,36,700,C.ink,'center');
 const size=44*p.scale;avatar(c,id,p.x+164*p.scale-size/2,p.y+374*p.scale-size/2,size);
}
function header(c,left){
 tx(c,left,84,84,33,700);
 tx(c,presentation.headerLines[0],1836,54,27,400,C.muted,'right');
 tx(c,`${presentation.headerLines[1]}（候选）`,1836,96,31,700,C.ink,'right');
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
 header(c,'桌牌支撑原型 · 公共原创头像');
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
 tx(c,`${state.time.toFixed(1)}s · ${state.phase} · 手姿未注册`,84,1019,34,700);
 tx(c,'只比较桌面 / 支撑 / 落点；真实手势与接触待验',1836,1019,31,400,C.muted,'right');
}
const times=[27,37.2,43.6,44.8],reports=[];
for(const variant of VARIANTS){
 const board=createCanvas(2624,906),b=board.getContext('2d');b.fillStyle=C.paper;b.fillRect(0,0,2624,906);
 tx(b,`${variant.title} / 同镜头停留与放回 / 公共原创占位`,32,57,34,700);
 for(const time of times){
  const canvas=createCanvas(1920,1080),state=tabletopState(variant.id,time,{scene:presentation.scene,timeline});draw(canvas.getContext('2d'),state);
  const name=`${variant.id}_${time.toFixed(1)}.png`;fs.writeFileSync(path.join(output,name),canvas.toBuffer('image/png'));reports.push({...state,image:name});
  if(time===27||time===44.8)b.drawImage(canvas,32+(time===27?0:1312),92,1280,720);
 }
 tx(b,'阶段接口：idle → reach → grasp → place（先接触承托）→ release；静态手不代表已验动作。',32,864,30,400,C.muted);
 fs.writeFileSync(path.join(output,`${variant.id}-comparison.png`),board.toBuffer('image/png'));
}
// Separate identity/layout proof: the same supplied head appears on body and matrix.
const identity=createCanvas(1920,1080),c=identity.getContext('2d');c.fillStyle=C.paper;c.fillRect(0,0,1920,1080);
header(c,'人物 → 头像 → 收益矩阵');
tx(c,'同一角色，从人物一直读到数对',84,218,62,700);tx(c,'公共预览使用原创人物头部；真实生产复用批准头层，包含完整路障轮廓。',84,282,32,400,C.muted);
for(const [id,x] of [['A',110],['B',470]])figure(c,id,{x,y:370,scale:.72});
polygon(c,[[70,716],[845,716],[886,807],[28,807]],C.faint);polygon(c,[[28,807],[886,807],[886,823],[28,823]],C.paper);
for(const [id,x] of [['a',110],['b',470]])c.drawImage(arms[id],x,370,420*.72,500*.72);
const mx=1136,my=512,cw=286,ch=164;
avatar(c,'B',mx+cw-170,350,72);tx(c,`${presentation.actors.B.name}选哪张牌（列）`,mx+cw-82,399,34,700);
for(const [column,strategy] of presentation.scene.strategies.entries())tx(c,strategy.label,mx+cw*(column+.5),487,40,700,C.ink,'center');
for(const [row,strategy] of presentation.scene.strategies.entries()){
 const y=my+ch*(row+.5);avatar(c,'A',mx-250,y-65,64);tx(c,presentation.actors.A.name,mx-176,y-20,34,700);tx(c,`选${strategy.label}（行）`,mx-176,y+29,32,400,C.muted);
 for(let column=0;column<2;column++){
  const selected=row===presentation.scene.selected.row&&column===presentation.scene.selected.column;
  round(c,mx+column*cw,my+row*ch,cw,ch,0,selected?C.faint:C.paper,C.ink,selected?4:2.5);
  tx(c,`(${presentation.matrix.values[row][column].join(', ')})`,mx+cw*(column+.5),y+18,48,700,C.ink,'center');
 }
}
tx(c,`数对顺序：${presentation.actors.A.name}，${presentation.actors.B.name}`,mx,my+2*ch+72,34,700);
line(c,84,969,1836,969,C.light,1.5);tx(c,'身份接口草稿 · 字号固定 · 新口播与时间轴待修订',84,1019,34,700);tx(c,'真实头层与矩阵净空仍需实际像素验收',1836,1019,30,400,C.muted,'right');
fs.writeFileSync(path.join(output,'identity-matrix.png'),identity.toBuffer('image/png'));
fs.writeFileSync(path.join(output,'prototype-manifest.json'),JSON.stringify({status:'prototype',sourceCommit:spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim(),workingTreeDirty:Boolean(spawnSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).stdout.trim()),originalPublicOnly:true,timelineDuration:timeline.duration,times,handArtLinked:false,presentation:{header:presentation.header,headerLines:presentation.headerLines,narrationNames:presentation.narrationNames,status:presentation.status,timingRevision:presentation.timingRevision},reports},null,2)+'\n');
console.log(`Wrote 3 comparison boards, 12 native 1080p original-placeholder frames and 1 identity/matrix proof to ${path.relative(root,output)}. Prototype only; no production render changed.`);
