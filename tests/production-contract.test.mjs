import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
const read=name=>JSON.parse(fs.readFileSync(new URL(`../production/${name}`,import.meta.url),'utf8'));
const ajv=new Ajv2020({allErrors:true,strict:true});
const validators=Object.fromEntries(['cast','content','tokens'].map(name=>[name,ajv.compile(read(`schema/${name}.schema.json`))]));
test('production sources declare one canonical case/timeline and fixed layout',()=>{
 for(const name of Object.keys(validators))assert(validators[name](read(`${name}.json`)),JSON.stringify(validators[name].errors));
});
for(const [label,name,mutate] of [
 ['swapped A identity','cast',data=>{data.actors.A.identity_shape='square';}],
 ['outside asset path','cast',data=>{data.actors.A.asset='../external.png';}],
 ['duplicated editable display name','cast',data=>{data.actors.A.display_name='ignored';}],
 ['different narration source','content',data=>{data.narration_source='old/timeline.json';}],
 ['unconsumed body size','tokens',data=>{data.type.body=8;}],
])test(`production contract rejects ${label}`,()=>{const data=read(`${name}.json`);mutate(data);assert.equal(validators[name](data),false);});
