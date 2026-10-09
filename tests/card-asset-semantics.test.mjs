import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020.js';
import {ROOT,pythonCommand} from '../scripts/python.mjs';
import {withSourceFixture} from '../scripts/source-fixture.mjs';

const read=relative=>JSON.parse(fs.readFileSync(path.join(ROOT,relative),'utf8'));
const cast=read('production/cast.json');
const validate=new Ajv2020({allErrors:true,strict:true}).compile(read('production/schema/cast.schema.json'));
const run=(root,source,fontAware=false)=>spawnSync(process.execPath,[
 ...(fontAware?['--import','./scripts/isolated-fonts.mjs']:[]),'--input-type=module','-e',source,
],{cwd:root,encoding:'utf8',timeout:120000,env:{...process.env,PYTHON:pythonCommand()}});

const mutations=[
 ['swapped red and blue',data=>{
  [data.strategies.red.asset,data.strategies.blue.asset]=[data.strategies.blue.asset,data.strategies.red.asset];
 }],
 ...['red','blue','back'].flatMap(kind=>['red','blue','back'].filter(other=>other!==kind).map(other=>[
  `${kind} using ${other}`,data=>{data.strategies[kind].asset=`assets/card_${other}.svg`;},
 ])),
 ...['red','blue','back'].map(kind=>[`${kind} using a person`,data=>{data.strategies[kind].asset='assets/person_a.svg';}]),
];

test('strategy asset schema rejects swaps and other valid SVG paths for every card role',()=>{
 assert.equal(validate(cast),true,JSON.stringify(validate.errors));
 for(const [label,mutate] of mutations){
  const data=structuredClone(cast);mutate(data);
  assert.equal(validate(data),false,label);
  assert(validate.errors.some(error=>error.keyword==='const'&&/^\/strategies\/(red|blue|back)\/asset$/.test(error.instancePath)),JSON.stringify(validate.errors));
 }
});

test('real production model rejects wrong card semantics before any drawing or font loading',()=>withSourceFixture(root=>{
 const source="await import('./production/src/model.mjs'); console.log('MODEL_ACCEPTED');";
 const valid=run(root,source);assert.equal(valid.status,0,valid.stdout+valid.stderr);assert.match(valid.stdout,/MODEL_ACCEPTED/);
 for(const [label,mutate] of mutations){
  const data=structuredClone(cast);mutate(data);fs.writeFileSync(path.join(root,'production/cast.json'),JSON.stringify(data));
  const result=run(root,source);
  assert.notEqual(result.status,0,label);assert.match(result.stderr,/Production cast schema:/,result.stderr);
  assert.match(result.stderr,/\/strategies\/(red|blue|back)\/asset/,result.stderr);
  assert.match(result.stderr,/must be equal to constant/,result.stderr);
  assert.doesNotMatch(result.stdout,/MODEL_ACCEPTED/);
 }
}));

test('real card rendering retains distinct colors and symbols with default and customized case labels',()=>withSourceFixture(root=>{
 const source=`
  import assert from 'node:assert/strict';
  import fs from 'node:fs';
  import {createCanvas} from '@napi-rs/canvas';
  import {card,prepareAssets,C} from './production/src/primitives.mjs';
  import {CAST,sceneData} from './production/src/model.mjs';
  process.argv.push('--placeholder-cast');
  await prepareAssets(1);
  const rgba=hex=>[...hex.slice(1).match(/../g).map(value=>parseInt(value,16)),255];
  const results={};
  for(const kind of ['red','blue','back']){
   const canvas=createCanvas(140,190),ctx=canvas.getContext('2d'),labels=[];
   const fillText=ctx.fillText.bind(ctx);
   ctx.fillText=(text,...args)=>{labels.push(text);return fillText(text,...args);};
   card(ctx,kind,70,95,140);
   const pixel=(x,y)=>[...ctx.getImageData(x,y,1,1).data];
   if(kind==='back'){
    assert.deepEqual(labels,[],'Card back must not reveal a strategy label');
    assert.notDeepEqual(pixel(30,30),rgba(C.red));assert.notDeepEqual(pixel(30,30),rgba(C.blue));
   }else{
    const strategy=sceneData.strategies.find(strategy=>strategy.id===kind);
    assert.equal(CAST.strategies[kind].label,strategy.label);
    assert.deepEqual(labels,[strategy.label]);
    assert.deepEqual(pixel(30,30),rgba(C[kind]),kind+' painted field');
    // Independent interior samples distinguish the circle from the horizontal bar.
    assert.deepEqual(pixel(70,55),rgba(kind==='red'?C.paper:C.blue),kind+' upper symbol');
    assert.deepEqual(pixel(48,73),rgba(kind==='blue'?C.paper:C.red),kind+' side symbol');
   }
   results[kind]={labels,labelPixels:Buffer.from(ctx.getImageData(20,115,100,55).data).toString('base64')};
  }
  console.log(JSON.stringify(results));
 `;
 const baseline=run(root,source,true);assert.equal(baseline.status,0,baseline.stdout+baseline.stderr);
 const original=JSON.parse(baseline.stdout);
 const scenes=read('design/scenes.json');
 const replacements=scenes.strategies.map((strategy,index)=>[strategy.label,['合作','退出'][index]]);
 for(const relative of ['design/scenes.json','chapters/01-four-elements/narration/timeline.json']){
  const file=path.join(root,relative);
  let document=fs.readFileSync(file,'utf8');
  for(const [before,after] of replacements)document=document.replaceAll(before,after);
  fs.writeFileSync(file,document);
 }
 const changed=run(root,source,true);assert.equal(changed.status,0,changed.stdout+changed.stderr);
 const customized=JSON.parse(changed.stdout);
 for(const [index,kind] of ['red','blue'].entries()){
  assert.deepEqual(customized[kind].labels,[replacements[index][1]]);
  assert.notEqual(customized[kind].labelPixels,original[kind].labelPixels,kind+' actual label ink must change');
 }
 assert.deepEqual(customized.back,original.back);
}));
