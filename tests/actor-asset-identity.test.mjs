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
const mutations=[
 ...['asset','fallback_asset'].map(field=>[`swapped ${field}`,data=>{
  [data.actors.A[field],data.actors.B[field]]=[data.actors.B[field],data.actors.A[field]];
 }]),
 ['swapped both routes',data=>{
  for(const field of ['asset','fallback_asset'])[data.actors.A[field],data.actors.B[field]]=[data.actors.B[field],data.actors.A[field]];
 }],
 ...['A','B'].flatMap(id=>{
  const other=id==='A'?'b':'a';
  return [
   [`${id} crossed private head`,data=>{data.actors[id].asset=`private_characters/pvz/assets/${other}_head.png`;}],
   [`${id} crossed fallback`,data=>{data.actors[id].fallback_asset=`assets/person_${other}.svg`;}],
   [`${id} foreign public asset`,data=>{data.actors[id].asset=`assets/person_${other}.svg`;}],
   [`${id} public asset misreports private rig`,data=>{data.actors[id].asset=`assets/person_${id.toLowerCase()}.svg`;}],
   [`${id} card asset`,data=>{data.actors[id].asset='assets/card_red.svg';}],
   [`${id} card fallback`,data=>{data.actors[id].fallback_asset='assets/card_blue.svg';}],
  ];
 }),
];
const run=(root,source,fontAware=false)=>spawnSync(process.execPath,[
 ...(fontAware?['--import','./scripts/isolated-fonts.mjs']:[]),'--input-type=module','-e',source,
],{cwd:root,encoding:'utf8',timeout:120000,env:{...process.env,PYTHON:pythonCommand()}});

function applyCaseReuse(root){
 const file=path.join(root,'design/scenes.json'),scene=JSON.parse(fs.readFileSync(file,'utf8'));
 // Exact supported case-reuse fixture; the test also runs inside that fixture.
 scene.actors[0].label='明月';scene.actors[1].label='青禾';
 scene.strategies[0].label='合作';scene.strategies[1].label='退出';
 scene.payoffs=[[[11,12],[21,22]],[[31,32],[41,42]]];
 scene.selected={row:1,column:0,actorA:'blue',actorB:'red'};
 fs.writeFileSync(file,JSON.stringify(scene));
 const result=spawnSync(process.execPath,['scripts/build-narration.mjs'],{
  cwd:root,encoding:'utf8',timeout:120000,env:{...process.env,PYTHON:pythonCommand()},
 });
 assert.equal(result.status,0,result.stdout+result.stderr);
}

test('actor schema binds private and fallback paths to A/B instead of accepting other valid paths',()=>{
 assert.equal(validate(cast),true,JSON.stringify(validate.errors));
 for(const [label,mutate] of mutations){
  const changed=structuredClone(cast);mutate(changed);
  assert.notDeepEqual(changed,cast,`${label}: negative mutation must change the current fixture`);
  assert.equal(validate(changed),false,label);
  assert(validate.errors.some(error=>error.keyword==='const'&&/^\/actors\/[AB]\/(asset|fallback_asset)$/.test(error.instancePath)),JSON.stringify(validate.errors));
 }
});

for(const variant of ['current case','exact case-reuse']){
 test(`real model rejects every crossed actor route before drawing: ${variant}`,()=>withSourceFixture(root=>{
  if(variant==='exact case-reuse')applyCaseReuse(root);
  const source=`
   import assert from 'node:assert/strict';
   import {CAST,sceneData,content} from './production/src/model.mjs';
   for(const actor of sceneData.actors)assert.equal(CAST.actors[actor.id].display_name,actor.label);
   assert.deepEqual(content.matrix.values,sceneData.payoffs);
   ${variant==='exact case-reuse'?"assert.deepEqual(sceneData.actors.map(actor=>actor.label),['明月','青禾']); assert.deepEqual(sceneData.selected,{row:1,column:0,actorA:'blue',actorB:'red'});":''}
   console.log('MODEL_ACCEPTED');
  `;
  const accepted=run(root,source);assert.equal(accepted.status,0,accepted.stdout+accepted.stderr);
  assert.match(accepted.stdout,/MODEL_ACCEPTED/);
  for(const [label,mutate] of mutations){
   const changed=structuredClone(cast);mutate(changed);
   assert.notDeepEqual(changed,cast,`${label}: no no-op mutations`);
   fs.writeFileSync(path.join(root,'production/cast.json'),JSON.stringify(changed));
   const result=run(root,source);
   assert.notEqual(result.status,0,label);
   assert.match(result.stderr,/Production cast schema:/,result.stderr);
   assert.match(result.stderr,/\/actors\/[AB]\/(asset|fallback_asset)/,result.stderr);
   assert.match(result.stderr,/must be equal to constant/,result.stderr);
   assert.doesNotMatch(result.stdout,/MODEL_ACCEPTED/);
  }
 }));

 test(`real public placeholder pixels retain actor identity: ${variant}`,()=>withSourceFixture(root=>{
  if(variant==='exact case-reuse')applyCaseReuse(root);
  const result=run(root,`
   import assert from 'node:assert/strict';
   import {createCanvas} from '@napi-rs/canvas';
   import {prepareAssets,person} from './production/src/primitives.mjs';
   import {CAST,sceneData} from './production/src/model.mjs';
   process.argv.push('--placeholder-cast');await prepareAssets(1);
   for(const id of ['A','B']){
    const canvas=createCanvas(420,500),ctx=canvas.getContext('2d');person(ctx,id,0,0);
    const pixel=(x,y)=>[...ctx.getImageData(x,y,1,1).data];
    // Independent interior samples from the shipped original artwork:
    // pale-blue shirt and round badge for A; beige blouse and square badge for B.
    const shirt=id==='A'?[229,237,244,255]:[242,231,206,255];
    assert.deepEqual(pixel(150,400),shirt,id+' shirt identity');
    assert.deepEqual(pixel(164,374),[36,62,102,255],id+' badge center');
    assert.deepEqual(pixel(146,356),id==='A'?shirt:[36,62,102,255],id+' badge shape');
    assert.equal(CAST.actors[id].display_name,sceneData.actors.find(actor=>actor.id===id).label);
   }
  `,true);
  assert.equal(result.status,0,result.stdout+result.stderr);
 }));
}
