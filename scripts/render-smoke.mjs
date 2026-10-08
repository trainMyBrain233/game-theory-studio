import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {ROOT} from './python.mjs';
import {registerFonts,canvasFont} from '../typography/fonts.mjs';
import {DATA,TOKENS,drawScene} from '../design/render-proposals.mjs';
import {verifySelection} from './render-contract.mjs';

registerFonts();
const data=structuredClone(DATA);
data.actors[0].label='甲';data.actors[1].label='乙';
data.strategies[0].label='合作';data.strategies[1].label='退出';
data.payoffs=[[[11,12],[21,22]],[[31,32],[41,42]]];
let states=0;
for(const style of Object.keys(TOKENS.styles)) for(let row=0;row<2;row++) for(let column=0;column<2;column++) {
  data.selected={row,column,actorA:data.strategies[row].id,actorB:data.strategies[column].id};
  const canvas=createCanvas(1920,1080);
  const boxes=drawScene(canvas,style,'payoff',{data});
  verifySelection(canvas,boxes,style,data,{row,column},TOKENS.styles[style]);
  const [a,b]=data.payoffs[row][column];
  assert.equal(boxes.at(-1).text,`甲选${data.strategies[row].label}、乙选${data.strategies[column].label}：甲得${a}分，乙得${b}分。`);
  states++;
}
const pixelHash=canvas=>createHash('sha256').update(Buffer.from(canvas.data())).digest('hex');
const participantHashes=new Set();
for(let row=0;row<2;row++)for(let column=0;column<2;column++) {
  const canvas=createCanvas(1920,1080);
  const boxes=drawScene(canvas,'textbook','participants',{data,selected:{row,column}});
  assert(boxes.some(box=>box.text==='甲与乙，各选一张牌。'));
  assert(boxes.some(box=>box.text==='合作') && boxes.some(box=>box.text==='退出'));
  const ctx=canvas.getContext('2d');
  for(const [x,y,chosen] of [[493,803,row===0],[612,819,row===1],[1304,819,column===0],[1423,803,column===1]]) {
    const pixel=[...ctx.getImageData(x,y,1,1).data];
    if(chosen) assert.deepEqual(pixel,[36,62,102,255],'Selected card underline must follow the player choice');
    else assert.notDeepEqual(pixel,[36,62,102,255],'Unselected card has an underline');
  }
  participantHashes.add(pixelHash(canvas));
}
assert.equal(participantHashes.size,4,'Participant card selection is frozen');
const precedenceCanvas=createCanvas(1920,1080);
const precedenceBoxes=drawScene(precedenceCanvas,'textbook','payoff',{data,selected:{row:0,column:1}});
verifySelection(precedenceCanvas,precedenceBoxes,'textbook',data,{row:0,column:1},TOKENS.styles.textbook);
const custom=structuredClone(data);custom.frames[1].subtitle='当前说明：{actorA} {scoreA}，{actorB} {scoreB}。';
const customBoxes=drawScene(createCanvas(1920,1080),'textbook','payoff',{data:custom,selected:{row:0,column:0}});
assert.equal(customBoxes.at(-1).text,'当前说明：甲 11，乙 12。','Authored subtitle template was ignored');

const baseline=createCanvas(1920,1080);drawScene(baseline,'textbook','payoff');
const previous={size:TOKENS.canvas.subtitleFont,family:TOKENS.styles.textbook.titleFamily};
try {
  TOKENS.canvas.subtitleFont=48;TOKENS.styles.textbook.titleFamily='serif';
  const changed=createCanvas(1920,1080),boxes=drawScene(changed,'textbook','payoff');
  assert.equal(boxes.at(-1).size,48);assert(boxes.at(-1).glyphHeight>34);
  assert(boxes.find(box=>box.text===DATA.frames[1].title).appliedFont.includes('Serif'));
  assert.notEqual(pixelHash(changed),pixelHash(baseline),'Typography configuration did not affect pixels');
}finally {TOKENS.canvas.subtitleFont=previous.size;TOKENS.styles.textbook.titleFamily=previous.family;}
assert.throws(()=>drawScene(createCanvas(1920,1080),'textbook','participants',{title:'非常长的标题'.repeat(20)}),/outside canvas|collision/);
// Original geometric animation fixture. Frame state is a pure function of explicit seconds.
function geometricFrame(time) {
  assert(Number.isFinite(time) && time>=0 && time<=1);
  const canvas=createCanvas(1920,1080),ctx=canvas.getContext('2d');
  ctx.fillStyle='#FFFEF8';ctx.fillRect(0,0,1920,1080);
  ctx.fillStyle='#243E66';ctx.font=canvasFont(60,700);ctx.fillText('共同选择｜原创几何测试',84,150);
  const progress=time*time*(3-2*time);
  ctx.beginPath();ctx.arc(360+progress*140,510,90,0,Math.PI*2);ctx.fill();
  ctx.fillRect(1320-progress*140,420,180,180);
  ctx.fillStyle='#FFFEF8';ctx.font=canvasFont(42,700);ctx.textAlign='center';
  ctx.fillText('A',360+progress*140,526);ctx.fillText('B',1410-progress*140,526);
  ctx.fillStyle='#243E66';ctx.font=canvasFont(40,400);ctx.fillText('两个参与者，各自选择。',960,1002);
  return canvas;
}
const out=path.join(ROOT,'artifacts/smoke');fs.mkdirSync(out,{recursive:true});
const hashes=new Map();
for(const time of [0,0.5,1,0.5,0]) {
  const canvas=geometricFrame(time),pixels=Buffer.from(canvas.data());
  if(hashes.has(time))assert.deepEqual(pixels,hashes.get(time),'Non-deterministic frame or order dependency');
  else{hashes.set(time,pixels);fs.writeFileSync(path.join(out,`geometry-${time}.png`),canvas.toBuffer('image/png'));}
}
assert.notDeepEqual(hashes.get(0),hashes.get(0.5));assert.notDeepEqual(hashes.get(0.5),hashes.get(1));
fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({mutatedMatrixStates:states,participantSelections:4,typographyMutation:'48px subtitle + serif title changed pixels',geometricTimes:[0,0.5,1],deterministicRepeatedFrames:true,thirdPartyImages:false,fullFilmAcceptance:false},null,2)+'\n');
console.log(`Render smoke: ${states} mutated matrix states, 4 card selections, typography changed pixels; original geometry at 0/0.5/1s; deterministic repeated frames; no third-party IP.`);
