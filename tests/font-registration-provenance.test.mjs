// Real font/native regressions: run by test:core AFTER clean-CI font setup.
// These are intentionally separate from the font-free ownership/cache tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {withSourceFixture} from '../scripts/source-fixture.mjs';
import {ROOT,pythonCommand} from '../scripts/python.mjs';

function withFonts(callback) {
 withSourceFixture(root=>{
  const directory=path.join(root,'typography/fonts');fs.unlinkSync(directory);fs.mkdirSync(directory);
  fs.cpSync(path.join(ROOT,'typography/fonts'),directory,{recursive:true,dereference:true});
  const run=code=>{
   const result=spawnSync(process.execPath,['--import','./scripts/isolated-fonts.mjs','--input-type=module','-e',code],
    {cwd:root,encoding:'utf8',env:{...process.env,PYTHON:pythonCommand()},maxBuffer:4*1024*1024});
   assert.equal(result.status,0,result.stdout+result.stderr);
  };
  callback(root,run);
 });
}

test('real registration rejects changed cached bytes and lost native ownership, preserving other aliases',()=>withFonts((root,run)=>run(`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {GlobalFonts} from '@napi-rs/canvas';
import {registerFonts,canvasFont,FONT_FAMILY,SERIF_FAMILY} from './typography/fonts.mjs';
const directory='typography/fonts/',manifest=directory+'prepared_font_manifest.json';
const originalManifest=fs.readFileSync(manifest);
// Same real bytes under another alias must survive owned-handle renewal.
const unrelated='Other verified renderer';
for(const weight of ['Regular','Bold'])assert(GlobalFonts.registerFromPath(directory+'NotoSansCJKSC-'+weight+'.otf',unrelated));
registerFonts({serif:true});assert(GlobalFonts.has(SERIF_FAMILY));
const python=process.env.PYTHON;process.env.PYTHON='missing-font-verifier';
registerFonts({serif:true});assert(GlobalFonts.has(unrelated));
assert.deepEqual(GlobalFonts.families.find(entry=>entry.family===unrelated).styles.map(style=>style.weight).sort(),[400,700]);
for(let i=0;i<100;i++)assert.match(canvasFont(40),/GameTheory Noto Sans SC/);
process.env.PYTHON=python;
const target=directory+'NotoSansCJKSC-Regular.otf',before=fs.readFileSync(target),metadata=fs.statSync(target);
const changed=Buffer.from(before);changed[changed.length-1]^=1;
fs.writeFileSync(target,changed);fs.utimesSync(target,metadata.atime,metadata.mtime);
const forged=JSON.parse(originalManifest);forged['NotoSansCJKSC-Regular.otf'].sha256=createHash('sha256').update(changed).digest('hex');
fs.writeFileSync(manifest,JSON.stringify(forged));const forgedBytes=fs.readFileSync(manifest);
assert.throws(()=>registerFonts(),/pinned official|re-extracted|checksum changed/);
assert.throws(()=>canvasFont(40),/Call registerFonts/);
assert.deepEqual(fs.readFileSync(manifest),forgedBytes);assert.deepEqual(fs.readFileSync(target),changed);
fs.writeFileSync(target,before);fs.writeFileSync(manifest,originalManifest);registerFonts();
// Remove everything externally, then install unrelated 400/700 Serif faces
// under the Sans alias. The same style list must not renew stale ownership.
GlobalFonts.removeAll();
for(const weight of ['Regular','Bold'])assert(GlobalFonts.registerFromPath(directory+'NotoSerifCJKSC-'+weight+'.otf',FONT_FAMILY));
assert.throws(()=>registerFonts(),/ownership was lost/);
assert.throws(()=>canvasFont(40),/Call registerFonts/);
`)));

test('an unrelated first-use pre-registered 400/700 alias is refused without independent verification',()=>withFonts((root,run)=>run(`
import assert from 'node:assert/strict';
import {GlobalFonts} from '@napi-rs/canvas';
import {registerFonts,FONT_FAMILY} from './typography/fonts.mjs';
for(const weight of ['Regular','Bold'])assert(GlobalFonts.registerFromPath('typography/fonts/NotoSerifCJKSC-'+weight+'.otf',FONT_FAMILY));
process.env.PYTHON='missing-font-verifier';
assert.throws(()=>registerFonts(),/Unowned SC font alias/);
`)));

test('static and production entry points independently reject modified valid-metadata OTFs with forged manifests',()=>withFonts((root,run)=>{
 const target=path.join(root,'typography/fonts/NotoSerifCJKSC-Bold.otf');
 fs.appendFileSync(target,'valid-metadata-but-untrusted-font');
 // Establish that this is the review reproduction, not a broken font header.
 const metadata=spawnSync(pythonCommand(),['-c',`
import hashlib, json, sys
from pathlib import Path
sys.path.insert(0, 'scripts')
import setup_fonts
target=Path(sys.argv[1]); setup_fonts.verify(target, 'Serif', 'Bold')
manifest_path=target.parent/'prepared_font_manifest.json'
manifest=json.loads(manifest_path.read_text()); manifest[target.name]['sha256']=hashlib.sha256(target.read_bytes()).hexdigest()
manifest_path.write_text(json.dumps(manifest))
`,target],{cwd:root,encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
 assert.equal(metadata.status,0,metadata.stderr);
 const before=fs.readFileSync(path.join(root,'typography/fonts/prepared_font_manifest.json'));
 for(const entry of ['./design/render-proposals.mjs','./production/src/primitives.mjs'])run(`
import assert from 'node:assert/strict';
await assert.rejects(()=>import(${JSON.stringify(entry)}),/pinned official|re-extracted|checksum changed/);
`);
 assert.deepEqual(fs.readFileSync(path.join(root,'typography/fonts/prepared_font_manifest.json')),before);
}));

test('registration reproduces a local SC TTC face and invalidates proof reuse on source or face-index changes',()=>withFonts((root,run)=>{
 const prepared=spawnSync(pythonCommand(),['-c',`
import json
from pathlib import Path
from fontTools.ttLib import TTFont, TTCollection
from fontTools.ttLib.tables.DefaultTable import DefaultTable
import sys
sys.path.insert(0, 'scripts')
import setup_fonts
directory=Path('typography/fonts').resolve(); target=directory/'NotoSansCJKSC-Regular.otf'; source=directory/'source.ttc'
with TTFont(target, lazy=True, recalcTimestamp=False) as font:
    marker=DefaultTable('TEST'); marker.data=b'registration provenance fixture'; font['TEST']=marker
    collection=TTCollection(); collection.fonts=[font]; collection.save(source)
manifest_path=directory/'prepared_font_manifest.json'; manifest=json.loads(manifest_path.read_text())
manifest[target.name]=setup_fonts.prepare(source,target,'Sans','Regular'); manifest_path.write_text(json.dumps(manifest))
`],{cwd:root,encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
 assert.equal(prepared.status,0,prepared.stderr);
 run(`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {registerFonts} from './typography/fonts.mjs';
const manifestPath='typography/fonts/prepared_font_manifest.json',manifestBytes=fs.readFileSync(manifestPath);
const target='typography/fonts/NotoSansCJKSC-Regular.otf',fontBytes=fs.readFileSync(target);
registerFonts();registerFonts();
assert.deepEqual(fs.readFileSync(target),fontBytes);assert.deepEqual(fs.readFileSync(manifestPath),manifestBytes);
const source='typography/fonts/source.ttc',before=fs.readFileSync(source),metadata=fs.statSync(source),changed=Buffer.from(before);
changed[changed.length-1]^=1;fs.writeFileSync(source,changed);fs.utimesSync(source,metadata.atime,metadata.mtime);
assert.throws(()=>registerFonts(),/TTC source or prepared checksum changed/);
fs.writeFileSync(source,before);registerFonts();
const manifest=JSON.parse(manifestBytes);manifest['NotoSansCJKSC-Regular.otf'].face_index=99;
fs.writeFileSync(manifestPath,JSON.stringify(manifest));const forged=fs.readFileSync(manifestPath);
assert.throws(()=>registerFonts(),/re-extracted/);assert.deepEqual(fs.readFileSync(manifestPath),forged);
`);
}));

test('correct real font bytes with forged canonical metadata fail before native first registration',()=>withFonts((root,run)=>{
 const filename=path.join(root,'typography/fonts/prepared_font_manifest.json');
 const original=fs.readFileSync(filename),manifest=JSON.parse(original);
 manifest['NotoSansCJKSC-Regular.otf'].family='False canonical family';
 fs.writeFileSync(filename,JSON.stringify(manifest));const before=fs.readFileSync(filename);
 run(`
import assert from 'node:assert/strict';
import {GlobalFonts} from '@napi-rs/canvas';
import {registerFonts,FONT_FAMILY} from './typography/fonts.mjs';
assert.equal(GlobalFonts.has(FONT_FAMILY),false);
assert.throws(()=>registerFonts(),/manifest does not match independently verified provenance: family/);
assert.equal(GlobalFonts.has(FONT_FAMILY),false);
`);
 assert.deepEqual(fs.readFileSync(filename),before);
}));
