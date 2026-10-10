import test from 'node:test';
import assert from 'node:assert/strict';
import {createFontRegistration} from '../typography/font-registration.mjs';

const entries=[['Sans','test SC Sans'],['Serif','test SC Serif']];
function fixture() {
 const records=new Map(),state={verified:0,registered:0,removed:0,after:()=>{},failAt:0};
 const native={
  has:family=>[...records.values()].some(record=>record.family===family),
  get families(){return [...new Set([...records.values()].map(record=>record.family))].map(family=>({family,
   styles:[...records.values()].filter(record=>record.family===family).map(record=>({weight:record.weight}))}));},
  register(bytes,family){
   state.registered++;
   if(state.failAt===state.registered)return null;
   const key={};records.set(key,{family,weight:JSON.parse(bytes).weight});return key;
  },
  removeBatch(keys){let count=0;for(const key of keys)if(records.delete(key))count++;state.removed+=count;return count;},
 };
 let fonts=entries.flatMap(([kind])=>['Regular','Bold'].map(weight=>({kind,weight,sha256:`${kind}-${weight}`,
  bytes:Buffer.from(JSON.stringify({weight:weight==='Regular'?400:700}))})));
 const registration=createFontRegistration(native,kinds=>{
  state.verified++;if(state.failVerification)throw Error('Untrusted font provenance');
  return {fonts:fonts.filter(font=>kinds.includes(font.kind)),assertUnchanged:()=>state.after()};
 });
 return {native,state,records,registration,changeFonts:()=>{fonts=fonts.map(font=>({...font,sha256:font.sha256+'changed'}));}};
}

test('first registration verifies before native work and keeps checks out of drawing',()=>{
 const {state,registration}=fixture();
 assert.equal(registration.isLoaded(entries[0][1]),false);
 registration.register(entries);assert.equal(state.verified,1);assert.equal(state.registered,4);
 for(let i=0;i<100;i++)assert(registration.isLoaded(entries[0][1]));
 assert.equal(state.verified,1);assert.equal(state.registered,4);
});
test('matching 400/700 styles never authorize an unowned pre-registered alias',()=>{
 const {native,state,registration}=fixture();
 for(const weight of [400,700])native.register(Buffer.from(JSON.stringify({weight})),entries[0][1]);
 assert.throws(()=>registration.register(entries),/Unowned SC font alias/);
 assert.equal(state.verified,0);assert.equal(state.removed,0);
});
test('same-byte reuse verifies and renews only owned handles',()=>{
 const {state,registration,native,records}=fixture();
 const unrelated=native.register(Buffer.from('{"weight":400}'),'unrelated');
 registration.register(entries);registration.register(entries);
 assert.equal(state.verified,2);assert.equal(state.removed,4);assert.equal(records.size,5);assert(records.has(unrelated));
});
test('native removal and same-style replacement cannot impersonate our retained handles',()=>{
 const {registration,native,records}=fixture();registration.register(entries);
 native.removeBatch([...records.keys()]);
 for(const weight of [400,700])native.register(Buffer.from(JSON.stringify({weight})),entries[0][1]);
 assert.throws(()=>registration.register(entries),/ownership was lost/);
 assert.equal(registration.isLoaded(entries[0][1]),false);
});
test('foreign registration alongside owned handles fails closed without deleting the foreign font',()=>{
 const {registration,native,records}=fixture();registration.register(entries);
 const foreign=native.register(Buffer.from('{"weight":400}'),entries[0][1]);
 assert.throws(()=>registration.register(entries),/Unowned SC font alias/);
 assert(records.has(foreign));assert.equal(registration.isLoaded(entries[0][1]),false);
});
test('valid replacement bytes cannot silently change existing canvas contexts',()=>{
 const {registration,state,changeFonts}=fixture();registration.register(entries);changeFonts();
 assert.throws(()=>registration.register(entries),/restart the rendering process/);
 assert.equal(state.removed,0);assert.equal(registration.isLoaded(entries[0][1]),false);
});
test('failed provenance invalidates drawing permission and never alters native registration',()=>{
 const {registration,state}=fixture();registration.register(entries);state.failVerification=true;
 assert.throws(()=>registration.register(entries),/Untrusted font provenance/);
 assert.equal(state.registered,4);assert.equal(state.removed,0);assert.equal(registration.isLoaded(entries[0][1]),false);
});
for(const failure of ['registration','style','changed bytes'])test(`${failure} failure rolls back only new owned handles`,()=>{
 const {registration,native,state,records}=fixture();
 const unrelated=native.register(Buffer.from('{"weight":400}'),'unrelated');
 if(failure==='registration')state.failAt=3;
 if(failure==='style')Object.defineProperty(native,'families',{get:()=>[]});
 if(failure==='changed bytes')state.after=()=>{throw Error('Changed during registration');};
 assert.throws(()=>registration.register(entries),/registration failed|400\/700|Changed during registration/);
 assert.deepEqual([...records.keys()],[unrelated]);
 assert.equal(registration.isLoaded(entries[0][1]),false);
});
