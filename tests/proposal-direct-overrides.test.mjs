// Boundary/content regression with real renderer and Unicode validation; no native Canvas.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {pythonCommand} from '../scripts/python.mjs';

const prelude = `
 import assert from 'node:assert/strict';
 import fs from 'node:fs';
 import os from 'node:os';
 import path from 'node:path';
 import {DATA,drawScene} from ${JSON.stringify(new URL('../design/render-proposals.mjs', import.meta.url).href)};
 const calls=[],drawn=[];
 const context=new Proxy({
  font:'10px sans-serif',
  fillText(text){calls.push('fillText');drawn.push(text);},
  measureText(){return {width:0,actualBoundingBoxLeft:0,actualBoundingBoxRight:0,actualBoundingBoxAscent:0,actualBoundingBoxDescent:0};},
  // Geometry is deliberately inert: this test checks validation and rendered text,
  // not actual glyph metrics, transforms, layout or pixel acceptance.
  getTransform(){return {a:0,b:0,c:0,d:0,e:960,f:540};}
 },{get(target,key){return key in target?target[key]:(...args)=>calls.push(key);}});
 const canvas={width:1920,height:1080,getContext(){calls.push('getContext');return context;}};
`;
function run(source) {
 const result=spawnSync(process.execPath,['--loader',new URL('./fixtures/proposal-header-stubs-loader.mjs',import.meta.url).pathname,'--input-type=module','-e',prelude+source],{
  cwd:os.tmpdir(),encoding:'utf8',timeout:30000,env:{...process.env,PYTHON:pythonCommand()},
 });
 assert.equal(result.status,0,result.stdout+result.stderr);
}

const controls=[...Array.from({length:32},(_,i)=>i),...Array.from({length:33},(_,i)=>127+i)];
const invalid=['甲\n乙','甲\u2028乙','',' ','\u3000\u00a0',' 甲','乙\u3000',
  ...controls.map(point=>'甲'+String.fromCodePoint(point)+'乙'),
  ...[0x2028,0x2029,0x200b,0x200e,0x202e,0x2066,0xfeff,0x034f,0x3164].map(point=>'甲'+String.fromCodePoint(point)+'乙'),
  '\u3164','\u2800','\u0301','\uD800','\uE000','\u{1C89}',null,42];

for (const field of ['title','lead','subtitle','chapter','section']) test(`direct ${field} overrides reject broken single-line text before drawing/publication`,()=>run(`
 const invalid=${JSON.stringify(invalid)};
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'proposal-direct-'));
 const old=path.join(temp,'published.png'),fresh=path.join(temp,'new-output');
 fs.writeFileSync(old,'previous verified output');
 try{
  for(const style of ['editorial','textbook','bright'])for(const sceneId of ['participants','payoff'])for(const value of invalid){
   calls.length=0;
   assert.throws(()=>{
    drawScene(canvas,style,sceneId,{[${JSON.stringify(field)}]:value});
    fs.mkdirSync(fresh,{recursive:true});fs.writeFileSync(old,'replacement');
   },new RegExp('Scene '+sceneId+'\\\\.${field}: label must'),style+' '+sceneId+' '+JSON.stringify(value));
   assert.deepEqual(calls,[],'Invalid direct text must not even acquire a drawing context');
   assert.equal(fs.existsSync(fresh),false);
   assert.equal(fs.readFileSync(old,'utf8'),'previous verified output');
  }
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
`));

test('valid direct text keeps exact authored Unicode and replacement-data/selected precedence',()=>run(`
 const data=structuredClone(DATA);
 data.actors[0].label='甲方';data.actors[1].label='乙方';
 data.strategies[0].label='合作';data.strategies[1].label='竞争';
 data.payoffs=[[[2,4],[6,8]],[[9,7],[1,3]]];
 data.selected={row:1,column:0,actorA:'blue',actorB:'red'};
 const before=structuredClone(data);
 for(const style of ['editorial','textbook','bright'])for(const sceneId of ['participants','payoff']){
  for(const selected of [undefined,{row:0,column:1}]){
   const title='甲 e\\u0301 Ａ\\u00a0 B',lead='{actorA}与{actorB}',chapter='九',section='示例';
   const override={data,title,lead,chapter,section,subtitle:'{actorA}选{strategyA}，{actorB}选{strategyB}，{scoreA}与{scoreB}'};
   if(selected)override.selected=selected;
   drawn.length=0;calls.length=0;
   drawScene(canvas,style,sceneId,override);
   assert(drawn.includes(title),'Do not normalize authored text');
   assert(drawn.includes('甲方与乙方'));
   assert(drawn.some(text=>String(text).includes(chapter)));
   assert(drawn.some(text=>String(text).includes(section)));
   const subtitle=selected?'甲方选合作，乙方选竞争，6与8':'甲方选竞争，乙方选合作，9与7';
   assert(drawn.includes(subtitle),JSON.stringify(drawn));
   assert(calls.includes('fillText'));
   assert.deepEqual(data,before,'Do not mutate replacement data');
  }
 }
`));
