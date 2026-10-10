import '../scripts/isolated-fonts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {ROOT,pythonCommand} from '../scripts/python.mjs';

// Real native mutations in separate, serial processes. No FontKey mock can
// establish what removeBatch does after removal or same-family replacement.
for(const mutation of ['remove','replace','append','alias','single-face'])test(`native font ownership rejects ${mutation} before render and raster-cache reuse`,()=>{
 const code=`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GlobalFonts} from '@napi-rs/canvas';
import {createRenderSession} from './production/src/animatic/render-frame.mjs';
import {createRasterCache} from './production/src/animatic/raster-cache.mjs';
import {prepareVerifiedAnimaticFonts,registerVerifiedAnimaticFonts} from './production/src/animatic/font-resources.mjs';
import {syntheticCast} from './tests/fixtures/animatic/synthetic-cast.mjs';
const options={plan:JSON.parse(fs.readFileSync('tests/fixtures/animatic/minimal-plan.json')),adapters:syntheticCast()};
const session=createRenderSession(options),cache=createRasterCache(session);
const expected=cache.get(0);assert.deepEqual(cache.get(0),expected);
const second=registerVerifiedAnimaticFonts(prepareVerifiedAnimaticFonts(['中文']));
assert.equal(second.family,session.fontFamily);
assert.deepEqual(cache.get(0),expected,'Legitimate renewal must preserve earlier sessions and PNG bytes');
const mutation=${JSON.stringify(mutation)};
if(['remove','replace'].includes(mutation))assert(GlobalFonts.removeAll()>=2);
if(mutation==='single-face'){
 const key=GlobalFonts.register(fs.readFileSync('typography/fonts/NotoSansCJKSC-Regular.otf'),session.fontFamily);
 assert(GlobalFonts.remove(key));
}
if(mutation!=='remove'){
 for(const weight of mutation==='single-face'?['Regular']:['Regular','Bold']){
  const foreign=fs.readFileSync('typography/fonts/NotoSerifCJKSC-'+weight+'.otf');
  assert(!foreign.equals(fs.readFileSync('typography/fonts/NotoSansCJKSC-'+weight+'.otf')));
  assert(GlobalFonts.register(foreign,mutation==='alias'?'Foreign Serif':session.fontFamily));
 }
 if(mutation==='alias')assert(GlobalFonts.setAlias('Foreign Serif',session.fontFamily));
 const weights=GlobalFonts.families.find(entry=>entry.family===session.fontFamily).styles.map(style=>style.weight);
 assert([400,700].every(weight=>weights.includes(weight)),'Foreign real fonts reproduce the old style-only acceptance');
}
const stats=cache.stats();
assert.throws(()=>cache.get(0),/registration ownership was lost/,'A populated cache must reject native ownership drift');
assert.deepEqual(cache.stats(),stats,'Rejected cache access must not count a hit or miss');
assert.throws(()=>session.render(0),/registration ownership was lost/);
assert.throws(()=>cache.get(1),/registration ownership was lost/);
assert.throws(()=>second.assertUnchanged(),/registration ownership was lost/);
assert.throws(()=>registerVerifiedAnimaticFonts(prepareVerifiedAnimaticFonts(['中文'])),/registration ownership was lost/);
GlobalFonts.removeAll();
assert.throws(()=>createRenderSession(options),/registration ownership was lost/,'Removing foreign fonts cannot silently restore trust');
`;
 const result=spawnSync(process.execPath,['--import','./scripts/isolated-fonts.mjs','--input-type=module','-e',code],{
  cwd:ROOT,encoding:'utf8',maxBuffer:4*1024*1024,timeout:120000,env:{...process.env,PYTHON:pythonCommand()}
 });
 assert.equal(result.status,0,`Native ${mutation} test failed (status=${result.status}, signal=${result.signal}, error=${result.error?.message || 'none'}):\n${result.stdout}${result.stderr}`);
});


test('same verified bytes may be reconstructed without trusting different font content',()=>{
 const code=`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GlobalFonts} from '@napi-rs/canvas';
import {prepareVerifiedAnimaticFonts,registerVerifiedAnimaticFonts} from './production/src/animatic/font-resources.mjs';
const proof=registerVerifiedAnimaticFonts(prepareVerifiedAnimaticFonts(['中文']));
GlobalFonts.removeAll();
for(const weight of ['Regular','Bold'])assert(GlobalFonts.register(fs.readFileSync('typography/fonts/NotoSansCJKSC-'+weight+'.otf'),proof.family));
proof.assertUnchanged();
`;
 const result=spawnSync(process.execPath,['--import','./scripts/isolated-fonts.mjs','--input-type=module','-e',code],{
  cwd:ROOT,encoding:'utf8',timeout:120000,env:{...process.env,PYTHON:pythonCommand()}
 });
 assert.equal(result.status,0,`Identical-byte reconstruction failed (status=${result.status}, signal=${result.signal}): ${result.stdout}${result.stderr}`);
});
