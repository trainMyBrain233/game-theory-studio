import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {presentationModel} from '../design/experiments/tabletop/presentation.mjs';

const read=file=>JSON.parse(fs.readFileSync(new URL(file,import.meta.url),'utf8'));
const scene=read('../design/scenes.json'),presentation=read('../design/experiments/tabletop/presentation.json');
const set=(config,keys,value)=>{const target=keys.slice(0,-1).reduce((object,key)=>object[key],config);target[keys.at(-1)]=value};
const textFields=[['series'],['episode','title'],['actors','A','name'],['actors','B','name']];

test('presentation accepts normal four-character Chinese names and readable single-line text',()=>{
 const config=structuredClone(presentation);config.series='PvZ 王国';config.episode.title='共同选择（草稿）';
 config.actors.A.name='明月同学';config.actors.B.name='青禾同学';
 const model=presentationModel(config,scene);
 assert.deepEqual(model.narrationNames,{A:'明月同学',B:'青禾同学'});
 assert.deepEqual(model.headerLines,['PvZ 王国','第01集·共同选择（草稿）']);
 assert.deepEqual(model.scene.actors.map(actor=>actor.label),['明月同学','青禾同学']);
});
for(const keys of textFields)test(`presentation rejects blank and control-containing ${keys.join('.')}`,()=>{
 const controls=[...Array.from({length:32},(_,i)=>i),...Array.from({length:33},(_,i)=>127+i),0x200b,0x200e,0x2028,0x2029,0x202e,0x2066,0xfeff];
 const invalid=['',' ','　\u00a0 ',...controls.map(code=>`甲${String.fromCodePoint(code)}乙`)];
 for(const value of invalid){
  const config=structuredClone(presentation);set(config,keys,value);
  assert.throws(()=>presentationModel(config,scene),/Draft presentation schema/,`${keys.join('.')}: ${JSON.stringify(value)} must be rejected.`);
 }
});
test('all presentation string fields reject newline, control and whitespace-only mutations',()=>{
 const paths=[['schemaVersion'],['status'],['episode','number'],...textFields,...['A','B'].flatMap(id=>[['actors',id,'avatar','actor'],['actors',id,'avatar','layer']])];
 for(const keys of paths){
  const original=keys.reduce((object,key)=>object[key],presentation);
  for(const value of [original+'\n',original+'\r',original+'\u0000','　 ']){
   const config=structuredClone(presentation);set(config,keys,value);
   assert.throws(()=>presentationModel(config,scene),/Draft presentation schema/,`${keys.join('.')}: ${JSON.stringify(value)}`);
  }
 }
});
test('single-line validation keeps the existing text length limits',()=>{
 for(const [keys,maxLength] of textFields.map(keys=>[keys,keys.at(-1)==='name'?10:16])){
  const config=structuredClone(presentation);set(config,keys,'字'.repeat(maxLength));assert.doesNotThrow(()=>presentationModel(config,scene));
  set(config,keys,'字'.repeat(maxLength+1));assert.throws(()=>presentationModel(config,scene),/maxLength/);
 }
});
