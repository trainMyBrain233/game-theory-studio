import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {presentationModel} from '../design/experiments/tabletop/presentation.mjs';

const read=file=>JSON.parse(fs.readFileSync(new URL(file,import.meta.url),'utf8'));
const scene=read('../design/scenes.json'),presentation=read('../design/experiments/tabletop/presentation.json');
const withNames=names=>{
 const config=structuredClone(presentation);
 for(const [index,id] of ['A','B'].entries())config.actors[id].name=names[index];
 return config;
};

for(const [reason,names] of [
 ['leading whitespace',[' 甲方','乙方']],
 ['trailing whitespace',['甲方','甲方 ']],
 ['trailing Unicode space',['甲方','甲方\u00a0']],
 ['default-ignorable combining mark',['甲\u034f','乙']],
 ['default-ignorable letter',['\u3164','乙']],
 ['only punctuation or symbols',['。🙂','乙']],
 ['only combining marks',['\u0301','乙']],
 ['unpaired surrogate',['甲\ud800','乙']],
 ['private-use scalar',['甲\ue000','乙']],
 ['unassigned scalar',['甲\u{10ffff}','乙']],
 ['post-Unicode-15 scalar',['甲\u{1c89}','乙']],
])test(`presentation names reject ${reason} through the shared visible-label contract`,()=>{
 assert.throws(()=>presentationModel(withNames(names),scene),/label must meet the Unicode text contract/);
});

for(const [reason,names] of [
 ['exact match',['甲方','甲方']],
 ['fullwidth equivalent',['Ａ','A']],
 ['combining equivalent',['é','e\u0301']],
 ['compatibility equivalent',['Ⅻ','XII']],
 ['Unicode-15 compatibility equivalent',['\u{1e030}','а']],
 ['space equivalent',['甲 方','甲\u00a0方']],
 ['collapsed-space equivalent',['甲 方','甲  方']],
])test(`presentation names reject a ${reason} after normalization`,()=>{
 assert.throws(()=>presentationModel(withNames(names),scene),/Distinct players need distinct visible names after Unicode normalization/);
});

test('valid presentation identities preserve authored scalars, owners and the current case without mutation',()=>{
 for(const names of [scene.actors.map(actor=>actor.label),Object.values(presentation.actors).map(actor=>actor.name),['明月同学','青禾同学'],['é𠀀','Ⅻe\u0301'],['甲，乙','丙'],['Ａ','B'],['字'.repeat(10),'𠀀'.repeat(10)]]){
  const config=withNames(names),beforeConfig=structuredClone(config),beforeScene=structuredClone(scene);
  const model=presentationModel(config,scene);
  assert.deepEqual(model.narrationNames,{A:names[0],B:names[1]});
  assert.deepEqual(model.actors,config.actors);
  assert.deepEqual(model.scene.actors.map(actor=>actor.label),names);
  assert.deepEqual(model.scene.actors.map(actor=>actor.id),['A','B']);
  assert.deepEqual(model.scene.payoffs,scene.payoffs);
  assert.deepEqual(model.scene.strategies,scene.strategies);
  assert.deepEqual(model.scene.selected,scene.selected);
  assert.deepEqual(config,beforeConfig);assert.deepEqual(scene,beforeScene);
 }
});
