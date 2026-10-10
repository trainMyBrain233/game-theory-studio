import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneData,CAST,resolveCastText} from '../production/src/model.mjs';
import {validateScenes} from '../scripts/validate-data.mjs';

function withNames(aliases,names,run){
 const original=sceneData.actors.map(actor=>({label:actor.label,name:CAST.actors[actor.id].display_name}));
 const strategies=Object.fromEntries(Object.entries(CAST.strategies).map(([id,value])=>[id,value.label]));
 try{
  sceneData.actors.forEach((actor,i)=>{actor.label=aliases[i];CAST.actors[actor.id].display_name=names[i];});
  run();
 }finally{
  sceneData.actors.forEach((actor,i)=>{actor.label=original[i].label;CAST.actors[actor.id].display_name=original[i].name;});
  for(const [id,label] of Object.entries(strategies))CAST.strategies[id].label=label;
 }
}

test('changed Chinese names expand tokens and legacy aliases exactly once',()=>withNames(['明月','青禾'],['明月同学','青禾同学'],()=>{
 assert.equal(resolveCastText('{{A}}、{{B}}；明月、青禾。'),'明月同学、青禾同学；明月同学、青禾同学。');
}));
test('token replacement output that equals another alias is not cascaded',()=>withNames(['甲','乙'],['乙','丙'],()=>{
 assert.equal(resolveCastText('{{A}} / 甲 / 乙 / {{B}}'),'乙 / 乙 / 丙 / 丙');
}));
test('strategy token output containing a player alias stays literal',()=>withNames(['明月','青禾'],['明月同学','青禾同学'],()=>{
 CAST.strategies.red.label='明月';CAST.strategies.blue.label='青禾';
 assert.equal(resolveCastText('{{red}}、{{blue}}；{{A}}、{{B}}'),'明月、青禾；明月同学、青禾同学');
}));
test('legacy aliases use longest literal match and escape punctuation',()=>{
 withNames(['明','明月'],['甲','乙'],()=>assert.equal(resolveCastText('明月、明、{{A}}、{{B}}'),'乙、甲、甲、乙'));
 withNames(['A+','B?'],['甲','乙'],()=>assert.equal(resolveCastText('A+，B?；AAAA，BB，{{A}}'),'甲，乙；AAAA，BB，甲'));
});
test('canonical names remain unchanged and unknown tokens remain literal',()=>withNames(['明月','青禾'],['明月','青禾'],()=>{
 assert.equal(resolveCastText('{{A}}，明月；{{B}}，青禾；{{unknown}}'),'明月，明月；青禾，青禾；{{unknown}}');
}));
test('ambiguous visible aliases remain rejected by scene validation',()=>{
 for(const labels of [['同名','同名'],['Ａ','A']]){
  const changed=structuredClone(sceneData);changed.actors.forEach((actor,i)=>actor.label=labels[i]);
  assert.throws(()=>validateScenes(changed),/Player visible labels must differ/);
 }
});
