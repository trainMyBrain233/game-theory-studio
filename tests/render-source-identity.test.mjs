import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {withSourceFixture} from '../scripts/source-fixture.mjs';
import {pythonCommand} from '../scripts/python.mjs';
import {renderFingerprint} from '../production/src/render-fingerprint.mjs';
import {createStillsManifest,sha256,STILLS_MANIFEST,TIMELINE_PATH} from '../production/src/checkpoints.mjs';

test('source identity is archive-safe, byte keyed and independent of generated output or timestamps',()=>{
 withSourceFixture(root=>{
  assert(!fs.existsSync(path.join(root,'.git')));
  const before=renderFingerprint({root});
  const file=path.join(root,'design/tokens.json'),stat=fs.statSync(file);
  fs.utimesSync(file,new Date(),new Date());
  fs.mkdirSync(path.join(root,'production/output'),{recursive:true});
  fs.writeFileSync(path.join(root,'production/output/ignored.png'),'not a source');
  assert.deepEqual(renderFingerprint({root}),before);
  fs.utimesSync(file,stat.atime,stat.mtime);
  assert(before.inputs.some(input=>input.path==='production/src/scenes.mjs'));
  assert(before.inputs.some(input=>input.path==='production/assets/card_red.svg'));
  assert(before.inputs.some(input=>input.path==='typography/fonts/NotoSansCJKSC-Bold.otf'));
 });
});

test('independent contact-sheet entrypoint rejects each changed input before decoding or publishing',()=>{
 withSourceFixture(root=>{
  // Synthetic manifest only: intentionally no PNGs. Each stale-source failure
  // must precede missing-image/font/Pillow errors, preserving an existing board.
  const output=path.join(root,'production/output');fs.mkdirSync(output,{recursive:true});
  const bytes=fs.readFileSync(path.join(root,TIMELINE_PATH));
  const manifest=createStillsManifest(bytes,{root,times:[1]});
  manifest.checkpoints.forEach(point=>point.sha256=sha256('synthetic fixture'));
  fs.writeFileSync(path.join(output,STILLS_MANIFEST),JSON.stringify(manifest));
  const board=path.join(output,'custom_contact_sheet.png');fs.writeFileSync(board,'existing board');
  const run=()=>spawnSync(pythonCommand(),[path.join(root,'production/make_contact_sheets.py')],{encoding:'utf8',env:{...process.env,PYTHON:pythonCommand(),NODE:process.execPath,PYTHONDONTWRITEBYTECODE:'1'}});
  assert.match(run().stderr,/Missing or changed still frame/,'Unchanged source passes identity and reaches the intentional missing fixture image.');
  for(const relative of ['design/tokens.json','design/scenes.json','production/tokens.json','production/src/scenes.mjs','production/assets/card_red.svg','production/assets/person_a.svg','typography/fonts/NotoSansCJKSC-Regular.otf','typography/fonts/prepared_font_manifest.json']){
   const file=path.join(root,relative);
   // Fonts in source fixtures are shared read-only. Replace their directory
   // link once with private copies before any negative mutation.
   if(relative.startsWith('typography/fonts/')&&fs.lstatSync(path.join(root,'typography/fonts')).isSymbolicLink()){
    const shared=fs.realpathSync(path.join(root,'typography/fonts'));
    fs.unlinkSync(path.join(root,'typography/fonts'));fs.cpSync(shared,path.join(root,'typography/fonts'),{recursive:true});
   }
   const original=fs.readFileSync(file),stat=fs.statSync(file);
   try{
    const changed=Buffer.from(original);changed[changed.length-1]^=1;
    fs.writeFileSync(file,changed);fs.utimesSync(file,stat.atime,stat.mtime);
    const result=run();assert.notEqual(result.status,0,relative);
    assert.match(result.stderr,/Stale still render identity/,relative+': '+result.stderr);
    assert.doesNotMatch(result.stderr,/Missing or changed still frame|ModuleNotFoundError/);
    assert.equal(fs.readFileSync(board,'utf8'),'existing board');
    assert.deepEqual(fs.readFileSync(file),changed,'Verifier must never repair modified inputs');
   }finally{fs.writeFileSync(file,original);fs.utimesSync(file,stat.atime,stat.mtime);}
  }
  assert.match(run().stderr,/Missing or changed still frame/,'Restoring exact bytes restores identity without regenerating metadata.');
 });
});
