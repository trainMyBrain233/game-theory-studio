/** Editable proposal renderer. Native 1920x1080; shared Skia/Canvas pipeline.
 * No AI-generated raster assets. All diagrams/characters/text are vector draw calls.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCanvas, loadImage} from '@napi-rs/canvas';
import {registerFonts,canvasFont,FONT_FAMILY,SERIF_FAMILY} from '../typography/fonts.mjs';
import {assertAppliedFont} from '../typography/font-contract.mjs';
import {validateScenes,validateSchema} from '../scripts/validate-data.mjs';
import {checkTextLayout} from '../scripts/layout.mjs';
import {proposalScale} from './canvas-geometry.mjs';
import {COMPARISON_BOARD,comparisonBoardTextPlan} from './comparison-board-text.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
export const TOKENS=JSON.parse(fs.readFileSync(path.join(HERE,'tokens.json')));
export const DATA=JSON.parse(fs.readFileSync(path.join(HERE,'scenes.json')));
validateScenes(DATA);validateSchema('tokens',TOKENS);registerFonts({serif:true});
let c,S,STATE=DATA; const bounds=[];
const actorLabel=who=>STATE.actors.find(actor=>actor.id===who).label;
const strategyLabel=kind=>STATE.strategies.find(strategy=>strategy.id===kind).label;
function focus(){const r=STATE.selected.row,k=STATE.selected.column;const [a,b]=STATE.payoffs[r][k];return {r,k,a,b,kindA:STATE.strategies[r].id,kindB:STATE.strategies[k].id};}
function rect(x,y,w,h,fill,stroke=null,lw=3){if(fill){c.fillStyle=fill;c.fillRect(x,y,w,h)}if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.strokeRect(x,y,w,h)}}
function line(x1,y1,x2,y2,color=S.ink,lw=3){c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.lineWidth=lw;c.strokeStyle=color;c.stroke()}
function shape(points,fill,stroke=null,lw=3){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();if(fill){c.fillStyle=fill;c.fill()}if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke()}}
function oval(x,y,rx,ry,fill,stroke=null,lw=3){c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);if(fill){c.fillStyle=fill;c.fill()}if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke()}}
function curve(pts,color=S.ink,lw=3){c.beginPath();c.moveTo(pts[0],pts[1]);c.bezierCurveTo(...pts.slice(2));c.strokeStyle=color;c.lineWidth=lw;c.stroke()}
function txt(t,x,y,size=36,weight=400,color=S.ink,align='left',family='sans',track=false){c.save();c.fillStyle=color;c.font=canvasFont(size,weight,{serif:family==='serif'});const applied=assertAppliedFont(c,{size,weight,family:family==='serif'?SERIF_FAMILY:FONT_FAMILY});const appliedSize=applied.size;c.textBaseline='middle';c.textAlign=align;c.fillText(t,x,y);const metrics=c.measureText(t);let w=metrics.width;const bx=align==='center'?x-w/2:align==='right'?x-w:x;const by=y-metrics.actualBoundingBoxAscent;const m=c.getTransform();const pts=[[bx,by],[bx+w,by],[bx,by+metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent],[bx+w,by+metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent]].map(([px,py])=>[m.a*px+m.c*py+m.e,m.b*px+m.d*py+m.f]);const xx=pts.map(p=>p[0]),yy=pts.map(p=>p[1]);bounds.push({text:t,x:Math.min(...xx),y:Math.min(...yy),width:Math.max(...xx)-Math.min(...xx),height:Math.max(...yy)-Math.min(...yy),size:appliedSize*Math.hypot(m.a,m.b),weight:applied.weight,family:applied.family,appliedFont:c.font,glyphHeight:c.measureText(t).actualBoundingBoxAscent+c.measureText(t).actualBoundingBoxDescent});c.restore()}
function wrapped(text,x,y,size,lineHeight,maxWidth,weight=400,family='sans'){
 c.font=canvasFont(size,weight,{serif:family==='serif'});
 assertAppliedFont(c,{size,weight,family:family==='serif'?SERIF_FAMILY:FONT_FAMILY});
 const lines=[];let remaining=text;
 while(remaining){
  if(c.measureText(remaining).width<=maxWidth){lines.push(remaining);break}
  const chars=[...remaining];let count=0;
  while(count<chars.length&&c.measureText(chars.slice(0,count+1).join('')).width<=maxWidth)count++;
  if(!count)throw Error('Text cannot fit at the readable font size');
  const prefix=chars.slice(0,count).join('');const punctuation=[...prefix.matchAll(/[，；：。？！]/g)].at(-1);
  if(punctuation)count=punctuation.index+1;
  lines.push(chars.slice(0,count).join(''));remaining=chars.slice(count).join('');
 }
 if(lines.length>2)throw Error('Text requires more than two lines; shorten the authored text');
 lines.forEach((line,i)=>txt(line,x,y+i*lineHeight,size,weight,S.ink,'left',family));
}
function arrow(x1,y1,x2,y2,color=S.ink,lw=4){line(x1,y1,x2,y2,color,lw);let a=Math.atan2(y2-y1,x2-x1);shape([[x2,y2],[x2-17*Math.cos(a-.5),y2-17*Math.sin(a-.5)],[x2-17*Math.cos(a+.5),y2-17*Math.sin(a+.5)]],color)}
function badge(who,x,y,r=24,fill=S.ink){if(who==='A')oval(x,y,r,r,fill);else rect(x-r,y-r,2*r,2*r,fill);txt(who,x,y-1,r*1.2,700,S.paper,'center')}
function smallChoice(kind,x,y,size=30){const cc=kind==='red'?TOKENS.semantic.strategyRed.fill:TOKENS.semantic.strategyBlue.fill;if(kind==='red')oval(x,y,size*.3,size*.3,cc);else rect(x-size*.32,y-size*.19,size*.64,size*.38,cc);txt(strategyLabel(kind),x+size*.6,y,size,700,S.ink)}
function card(kind,x,y,scale=1,angle=0,selected=false){c.save();c.translate(x,y);c.rotate(angle);c.scale(scale,scale);let cc=kind==='red'?TOKENS.semantic.strategyRed.fill:TOKENS.semantic.strategyBlue.fill;rect(-56,-63,112,126,S.paper,S.ink,S.stroke);rect(-47,-54,94,108,cc);if(kind==='red')oval(0,-20,16,16,S.paper);else rect(-19,-29,38,18,S.paper);txt(strategyLabel(kind),0,30,41,700,'#FFFFFF','center');if(selected){line(-34,76,34,76,S.ink,4)}c.restore()}
function scorePair(a,b,cx,cy,size=72,color=S.ink){txt(`(${a}, ${b})`,cx,cy,size,700,color,'center')}
function footer(scene){line(84,946,1836,946,S.line,2);txt(scene.subtitle,960,1002,TOKENS.canvas.subtitleFont,700,S.ink,'center')}
function header(scene,variant){if(variant==='editorial'){
 txt(`${scene.chapter} / ${scene.section}`,84,72,30,700);txt('博弈论入门',1836,72,30,400,S.ink,'right');line(84,113,1836,113,S.ink,3);
 }else if(variant==='textbook'){
 rect(84,48,66,66,S.ink);txt(scene.chapter,117,80,31,700,S.paper,'center');txt(`博弈论入门 · ${scene.section}`,175,80,30,700);txt(STATE.caseName,1836,80,30,400,S.muted,'right');
 }else{
 badge('A',106,78,22);badge('B',166,78,22);txt(`博弈论入门  /  ${scene.chapter} ${scene.section}`,211,78,30,700);txt(STATE.caseName,1836,78,30,700,S.ink,'right');
 }}
/** Each character is constructed from paths; role identity = A circle / B square. */
function human(x,y,scale,who,variant){c.save();c.translate(x,y);c.scale(scale,scale);let ink=S.ink,skin=variant==='bright'?'#F3D9BF':variant==='textbook'?'#FFFEF8':'#F7F4ED';let clothing=variant==='bright'?(who==='A'?S.accent:S.purple):variant==='textbook'?(who==='A'?'#E2E9F0':'#F0E5CD'):(who==='A'?ink:'#D8D8D0');let lw=variant==='bright'?6:3;
 // Arms first, then a purposeful upright torso.
 c.lineCap='round';curve([-72,60,-119,115,-114,177,-96,201],ink,lw);curve([72,60,116,102,123,163,104,200],ink,lw);
 c.beginPath();c.moveTo(-100,221);c.lineTo(-85,76);c.quadraticCurveTo(-80,37,-40,26);c.lineTo(40,26);c.quadraticCurveTo(80,37,85,76);c.lineTo(100,221);c.closePath();c.fillStyle=clothing;c.fill();c.strokeStyle=ink;c.lineWidth=lw;c.stroke();
 rect(-20,1,40,53,skin,ink,lw);oval(0,-76,67,86,skin,ink,lw);
 // Hair silhouettes use two distinct characters, not emoji faces.
 if(who==='A'){
  c.beginPath();c.moveTo(-66,-76);c.bezierCurveTo(-81,-162,-20,-187,28,-157);c.bezierCurveTo(61,-159,84,-127,66,-84);c.lineTo(49,-107);c.quadraticCurveTo(8,-108,-15,-131);c.quadraticCurveTo(-37,-112,-57,-114);c.closePath();c.fillStyle=ink;c.fill();
  oval(-28,-76,23,20,null,ink,lw);oval(28,-76,23,20,null,ink,lw);line(-5,-77,5,-77,ink,lw);line(-52,-79,-65,-84,ink,lw);
 }else{
  c.beginPath();c.moveTo(-67,-31);c.bezierCurveTo(-95,-122,-50,-184,10,-167);c.bezierCurveTo(75,-168,85,-79,68,-19);c.lineTo(44,-23);c.lineTo(54,-110);c.quadraticCurveTo(-10,-116,-47,-135);c.lineTo(-53,-34);c.closePath();c.fillStyle=ink;c.fill();
 }
 oval(-27,-73,4,5,ink);oval(27,-73,4,5,ink);curve([-17,-33,-4,-22,10,-22,20,-36],ink,3);line(0,-63,-4,-47,ink,2.5);
 if(variant==='editorial'&&who==='B'){for(let dx=-65;dx<85;dx+=16)line(dx,82,dx-17,217,ink,1.5)}
 if(variant==='textbook'){line(-53,61,0,93,ink,3);line(53,61,0,93,ink,3)}
 if(variant==='bright'){line(-42,46,-20,85,ink,4);line(42,46,20,85,ink,4)}
 // Hands sitting on the shared tabletop.
 oval(-91,209,23,12,skin,ink,lw);oval(95,209,23,12,skin,ink,lw);badge(who,0,157,22,variant==='editorial'&&who==='A'?S.paper:ink);
 // A white-on-white badge needs its reverse glyph.
 if(variant==='editorial'&&who==='A')txt('A',0,156,27,700,ink,'center');c.restore();}
function editorialPlayers(scene){
 txt(scene.title,84,228,88,700,S.ink,'left',S.titleFamily);
 wrapped(scene.lead,89,348,40,58,600);
 txt('2',80,625,238,700,S.accent,'left','serif');txt('个决策者',241,674,48,700,S.ink,'left','serif');
 line(90,751,689,751,S.ink,3);txt('各自目标',90,797,31,700,S.accent);txt('让自己的得分更高',90,854,TOKENS.font.body,400);
 // Clear illustrated scene on the right, as one editorial image.
 human(1100,471,.92,'A','editorial');human(1606,471,.92,'B','editorial');
 line(866,677,1830,677,S.ink,4);line(920,677,896,817,S.ink,3);line(1776,677,1800,817,S.ink,3);
 card('red',1035,741,.78,-.075,focus().r===0);card('blue',1141,759,.78,.04,focus().r===1);card('red',1541,759,.78,-.04,focus().k===0);card('blue',1647,741,.78,.075,focus().k===1);
 badge('A',1046,861,22);txt(`${actorLabel('A')}`,1087,861,36,700);badge('B',1552,861,22);txt(`${actorLabel('B')}`,1593,861,36,700);
 txt(STATE.caseName,1352,279,32,700,S.muted,'center');line(1230,316,1474,316,S.accent,5);
}
function editorialPayoff(scene){const f=focus();
 wrapped(scene.title,84,231,87,112,700,700,S.titleFamily);
 txt('收益矩阵',91,455,34,700,S.accent);wrapped(scene.lead,91,517,TOKENS.font.body,52,690);
 badge('A',116,615,24);txt(`先读${actorLabel('A')}的得分`,164,615,33,700);badge('B',116,682,24);txt(`再读${actorLabel('B')}的得分`,164,682,33,700);
 txt('这一次',91,785,30,400,S.muted);txt(`${f.a} 分，${f.b} 分`,89,849,57,700,S.accent,'left','serif');
 const x=976,y=421,cw=353,rh=184;
 txt(`${actorLabel('B')}的选择`,1329,248,34,700,S.ink,'center');line(976,288,1682,288,S.ink,3);
 smallChoice('red',1108,350,36);smallChoice('blue',1461,350,36);
 txt(`${actorLabel('A')}`,800,526,33,700);txt('的选择',784,575,30,400,S.muted);
 smallChoice('red',849,514,34);smallChoice('blue',849,697,34);
 rect(x,y,cw*2,rh*2,null,S.ink,3);line(x+cw,y,x+cw,y+rh*2,S.ink,3);line(x,y+rh,x+2*cw,y+rh,S.ink,3);
 rect(x+cw*f.k+3,y+rh*f.r+3,cw-6,rh-6,S.wash);rect(x+cw*f.k,y+rh*f.r,cw,rh,null,S.accent,6);
 STATE.payoffs.forEach((row,r)=>row.forEach((p,k)=>scorePair(...p,x+cw*(k+.5),y+rh*(r+.5),66,(r===f.r&&k===f.k)?S.accent:S.ink)));
 txt(`每格顺序：（${actorLabel('A')}，${actorLabel('B')}）`,1329,856,32,400,S.muted,'center');
}
function textbookPlayers(scene){
 txt(scene.title,84,215,79,700,S.ink,'left',S.titleFamily);wrapped(scene.lead,88,306,TOKENS.font.body,50,360);
 // One continuous tabletop drawing; no containers around individual actors.
 human(558,476,1.08,'A','textbook');human(1362,476,1.08,'B','textbook');
 line(296,714,1624,714,S.ink,4);line(349,714,330,832,S.ink,4);line(1571,714,1590,832,S.ink,4);
 card('red',493,738,.86,-.04,focus().r===0);card('blue',612,754,.86,.04,focus().r===1);card('red',1304,754,.86,-.04,focus().k===0);card('blue',1423,738,.86,.04,focus().k===1);
 badge('A',382,447,23);txt(`${actorLabel('A')}`,330,447,34,700,S.ink,'right');badge('B',1538,447,23);txt(`${actorLabel('B')}`,1590,447,34,700);
 // Shared outcome expressed as a central conjunction rather than a dashboard.
 txt('两人的选择',960,468,35,700,S.ink,'center');arrow(757,524,868,524,S.ink,3);arrow(1163,524,1052,524,S.ink,3);
 txt('共同决定得分',960,586,40,700,S.ink,'center');line(825,624,1095,624,S.accent,4);
 rect(84,861,9,47,S.ink);txt('参与者',115,884,35,700);txt('能作出决策的个体或组织',277,884,35,400);
}
function textbookPayoff(scene){const f=focus();
 txt(scene.title,84,215,79,700,S.ink,'left',S.titleFamily);txt(scene.lead,88,306,TOKENS.font.body,400,S.muted);
 const x=382,y=496,cw=332,rh=159;
 txt(`${actorLabel('B')}的选择`,714,380,34,700,S.ink,'center');line(382,413,1046,413,S.line,2);
 txt(`${actorLabel('A')}的选择`,84,628,32,700);
 smallChoice('red',516,447,33);smallChoice('blue',848,447,33);smallChoice('red',263,575,33);smallChoice('blue',263,735,33);
 rect(x,y,cw*2,rh*2,null,S.ink,3);rect(x+cw*f.k,y+rh*f.r,cw,rh,S.wash);line(x+cw,y,x+cw,y+2*rh,S.ink,3);line(x,y+rh,x+2*cw,y+rh,S.ink,3);rect(x+cw*f.k,y+rh*f.r,cw,rh,null,S.accent,6);
 STATE.payoffs.forEach((row,r)=>row.forEach((p,k)=>scorePair(...p,x+cw*(k+.5),y+rh*(r+.5),67)));
 txt(`每格顺序：（${actorLabel('A')}，${actorLabel('B')}）`,714,875,32,400,S.muted,'center');
 line(1194,384,1194,886,S.line,3);
 txt('这张表怎么读？',1270,427,43,700);
 for(const [i,t] of [`${actorLabel('A')}选${STATE.strategies[f.r].label} → 找到${STATE.strategies[f.r].label}行`,`${actorLabel('B')}选${STATE.strategies[f.k].label} → 找到${STATE.strategies[f.k].label}列`,`交叉这一格 → (${f.a}, ${f.b})`].entries()){
  oval(1295,514+i*90,24,24,S.ink);txt(String(i+1),1295,512+i*90,29,700,S.paper,'center');txt(t,1342,514+i*90,TOKENS.font.body,400);
 }
 line(1270,769,1836,769,S.ink,2);txt(`${actorLabel('A')} ${f.a}分   ${actorLabel('B')} ${f.b}分`,1270,831,42,700);
}
function brightPlayers(scene){
 rect(82,237,626,28,S.accent);txt(scene.title,84,202,82,700,S.ink,'left',S.titleFamily);txt(scene.lead,1836,214,TOKENS.font.body,400,S.ink,'right');
 // A broad stage, not a collection of cards. Hard edges establish a different rhythm.
 shape([[82,359],[1837,359],[1837,831],[82,831]],'#F7F0DB');
 human(491,510,1.06,'A','bright');human(1429,510,1.06,'B','bright');
 line(271,741,1649,741,S.ink,6);line(347,741,332,848,S.ink,5);line(1573,741,1588,848,S.ink,5);
 card('red',428,746,.84,-.09,focus().r===0);card('blue',547,765,.84,.05,focus().r===1);card('red',1371,765,.84,-.05,focus().k===0);card('blue',1490,746,.84,.09,focus().k===1);
 // A single functional oversized connector is the visual hero.
 arrow(706,510,835,510,S.ink,6);arrow(1214,510,1085,510,S.ink,6);
 txt('一起决定',960,486,50,700,S.ink,'center');txt('最后的得分',960,552,50,700,S.ink,'center');
 rect(828,611,264,67,S.accent,S.ink,4);txt('都想多得分',960,643,33,700,S.ink,'center');
 badge('A',431,890,24);txt(`${actorLabel('A')}`,477,890,36,700);badge('B',1369,890,24);txt(`${actorLabel('B')}`,1415,890,36,700);txt('2 个决策者',960,890,34,700,S.ink,'center');
}
function brightPayoff(scene){const f=focus();
 rect(82,237,929,28,S.accent);txt(scene.title,84,202,82,700,S.ink,'left',S.titleFamily);txt(scene.lead,1836,300,33,400,S.muted,'right');
 const x=316,y=444,cw=310,rh=181;
 txt(`${actorLabel('B')}的选择`,626,327,34,700,S.ink,'center');smallChoice('red',430,390,35);smallChoice('blue',740,390,35);
 txt(`${actorLabel('A')}`,117,535,35,700);txt('的选择',96,584,31,400);smallChoice('red',194,534,35);smallChoice('blue',194,716,35);
 rect(x,y,cw*2,rh*2,null,S.ink,5);rect(x+cw*f.k,y+rh*f.r,cw,rh,S.wash);line(x+cw,y,x+cw,y+2*rh,S.ink,5);line(x,y+rh,x+2*cw,y+rh,S.ink,5);
 STATE.payoffs.forEach((row,r)=>row.forEach((p,k)=>scorePair(...p,x+cw*(k+.5),y+rh*(r+.5),74)));
 txt(`每格顺序：（${actorLabel('A')}，${actorLabel('B')}）`,626,873,32,400,S.muted,'center');
 arrow(974,y+rh*(f.r+.5),1098,535,S.ink,5);
 // The focused cell is unpacked into two actor-owned results.
 smallChoice(f.kindA,1193,380,34);txt(`${actorLabel('A')}选`,1082,380,32,700);smallChoice(f.kindB,1593,380,34);txt(`${actorLabel('B')}选`,1482,380,32,700);
 badge('A',1218,497,34);badge('B',1620,497,34);
 txt(String(f.a),1218,649,174,700,S.ink,'center');txt(String(f.b),1620,649,174,700,S.ink,'center');
 rect(1123,769,190,69,S.accent,S.ink,4);rect(1525,769,190,69,'#DAD4EA',S.ink,4);txt(`${actorLabel('A')} · ${f.a}分`,1218,801,34,700,S.ink,'center');txt(`${actorLabel('B')} · ${f.b}分`,1620,801,34,700,S.ink,'center');
}
export function drawScene(canvas,styleId,sceneId,override={}){
 const scale=proposalScale(canvas.width,canvas.height);
 c=canvas.getContext('2d');S=TOKENS.styles[styleId];if(!S)throw Error('Unknown style');
 STATE={...DATA,...override.data};
 STATE.selected={...STATE.selected,...override.selected};
 STATE.selected.actorA=STATE.strategies[STATE.selected.row]?.id;STATE.selected.actorB=STATE.strategies[STATE.selected.column]?.id;
 validateScenes(STATE);
 const scene={...STATE.frames.find(x=>x.id===sceneId),...override};if(!scene.title)throw Error('Unknown scene');
 const f=focus();
 const variables={actorA:actorLabel('A'),actorB:actorLabel('B'),strategyA:strategyLabel(f.kindA),strategyB:strategyLabel(f.kindB),scoreA:f.a,scoreB:f.b};
 for(const key of ['title','lead','subtitle'])scene[key]=scene[key].replace(/\{([^}]+)\}/g,(_,name)=>{if(!Object.hasOwn(variables,name))throw Error(`Unknown scene text variable: ${name}`);return variables[name]});
 bounds.length=0;
 c.save();c.fillStyle=S.paper;c.fillRect(0,0,canvas.width,canvas.height);c.scale(scale,scale);c.lineJoin='round';
 header(scene,styleId);
 const fn={editorial:{participants:editorialPlayers,payoff:editorialPayoff},textbook:{participants:textbookPlayers,payoff:textbookPayoff},bright:{participants:brightPlayers,payoff:brightPayoff}}[styleId][sceneId];fn(scene);footer(scene);c.restore();
 const result=[...bounds];checkTextLayout(result,canvas.width,canvas.height,{collisions:true});return result;
}
// Shared by the CLI board compositor and focused typography regressions.
export function drawComparisonHeader(canvas,styleId){
 c=canvas.getContext('2d');S=TOKENS.styles[styleId];if(!S)throw Error('Unknown style');
 bounds.length=0;
 rect(0,0,canvas.width,canvas.height,S.paper);
 for(const run of comparisonBoardTextPlan(S))txt(run.text,run.x,run.y,run.size,run.weight,run.color,run.align,run.family);
 line(84,155,3756,155,S.line,2);
 const result=[...bounds];checkTextLayout(result,canvas.width,Math.min(canvas.height,COMPARISON_BOARD.headerHeight),{collisions:true});return result;
}
async function main(){
 // Reject every style before creating directories or writing any scene/board.
 for(const id of Object.keys(TOKENS.styles))drawComparisonHeader(createCanvas(COMPARISON_BOARD.width,COMPARISON_BOARD.headerHeight),id);
 fs.mkdirSync(path.join(HERE,'qa'),{recursive:true});fs.mkdirSync(path.join(HERE,'frames'),{recursive:true});fs.mkdirSync(path.join(HERE,'boards'),{recursive:true});
 const manifest={generatedAt:new Date().toISOString(),width:1920,height:1080,renderer:'@napi-rs/canvas',images:[]};
 for(const id of Object.keys(TOKENS.styles)){
  for(const scene of DATA.frames){const canvas=createCanvas(1920,1080);const textBounds=drawScene(canvas,id,scene.id);let file=`frames/${id}_${scene.id}_1920x1080.png`;fs.writeFileSync(path.join(HERE,file),canvas.toBuffer('image/png'));manifest.images.push({style:id,scene:scene.id,file,textBounds});console.log(file)}
  // Comparison board uses two native 1080p frames without raster upscaling.
  const board=createCanvas(COMPARISON_BOARD.width,COMPARISON_BOARD.height);drawComparisonHeader(board,id);
  for(const [i,scene] of DATA.frames.entries()){let im=await loadImage(path.join(HERE,`frames/${id}_${scene.id}_1920x1080.png`));c.drawImage(im,i*1920,COMPARISON_BOARD.headerHeight);}
  fs.writeFileSync(path.join(HERE,`boards/${id}_comparison_3840x1320.png`),board.toBuffer('image/png'));
 }
 fs.writeFileSync(path.join(HERE,'qa/render-manifest.json'),JSON.stringify(manifest,null,2));
}
if(process.argv[1]===fileURLToPath(import.meta.url))await main();
