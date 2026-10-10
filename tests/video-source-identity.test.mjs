import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {withSourceFixture} from '../scripts/source-fixture.mjs';
import {pythonCommand} from '../scripts/python.mjs';

const timeline='chapters/01-four-elements/narration/timeline.json';
test('video publication binds real source bytes before module loading and after encoder completion',()=>{
 withSourceFixture(root=>{
  const bin=path.join(root,'encoder-bin');fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin,'ffmpeg'),`#!/usr/bin/env node
import fs from 'node:fs';
if(process.argv.includes('-version'))process.exit(0);
fs.writeFileSync(process.env.ENCODER_STARTED,'started');
process.stdin.resume();process.stdin.on('end',()=>{
 fs.writeFileSync(process.argv.at(-1),'complete video');
 if(process.env.MUTATE_DURING_ENCODE)fs.appendFileSync(process.env.MUTATE_DURING_ENCODE,'\\n');
});
`);fs.chmodSync(path.join(bin,'ffmpeg'),0o755);
  // Font fixture directory starts as a shared read-only link. Make private
  // copies before mutations; no test may alter the selected project fonts.
  const fonts=path.join(root,'typography/fonts'),shared=fs.realpathSync(fonts);
  fs.unlinkSync(fonts);fs.cpSync(shared,fonts,{recursive:true});
  const output=path.join(root,'film.mp4'),started=path.join(root,'encoder-started');
  const run=(extra={})=>spawnSync(process.execPath,['--loader',path.join(root,'tests/fixtures/video-source-identity-loader.mjs'),path.join(root,'production/render.mjs'),'--placeholder-cast','--duration','.04','--out',output],{cwd:root,encoding:'utf8',timeout:60000,env:{...process.env,PYTHON:pythonCommand(),PATH:`${bin}${path.delimiter}${process.env.PATH}`,ENCODER_STARTED:started,...extra}});
  for(const relative of [null,timeline,'production/src/scenes.mjs','design/scenes.json','production/tokens.json','production/assets/person_a.svg','production/assets/card_red.svg','typography/fonts/NotoSansCJKSC-Regular.otf','typography/fonts/prepared_font_manifest.json']){
   const file=relative&&path.join(root,relative),bytes=file&&fs.readFileSync(file);
   for(const existing of relative?[true,false]:[true]){
    fs.rmSync(started,{force:true});fs.rmSync(output,{force:true});if(existing)fs.writeFileSync(output,'old sentinel');
    try{
     const result=run(file?{MUTATE_DURING_ENCODE:file}:{});assert.ifError(result.error&&Object.assign(result.error,{message:`${relative}, existing=${existing}: ${result.error.message} ${result.stderr}`}));
     assert(fs.existsSync(started),`${relative}: ${result.stdout}\n${result.stderr}`);assert.equal(fs.readFileSync(started,'utf8'),'started','Mutation must happen while real encoder transaction runs.');
     if(file){
      assert.notEqual(result.status,0,relative);assert.match(result.stderr,/Video encoding stopped: Render inputs changed/,relative+': '+result.stderr);
      if(existing)assert.equal(fs.readFileSync(output,'utf8'),'old sentinel');else assert(!fs.existsSync(output));
      assert.deepEqual(fs.readFileSync(file),Buffer.concat([bytes,Buffer.from('\n')]),'Verifier must not repair source');
     }else{assert.equal(result.status,0,result.stderr);assert.equal(fs.readFileSync(output,'utf8'),'complete video');}
     assert.deepEqual(fs.readdirSync(root).filter(name=>name.startsWith('.film')),[]);
    }finally{if(file)fs.writeFileSync(file,bytes);}
   }
  }
  const file=path.join(root,'design/scenes.json'),bytes=fs.readFileSync(file);
  try{
   fs.rmSync(started,{force:true});fs.writeFileSync(output,'old sentinel');
   const result=run({MUTATE_DURING_IMPORT:file});assert.ifError(result.error);assert.notEqual(result.status,0);
   assert.match(result.stderr,/Render inputs changed/,'Identity must predate model imports, including already loaded config.');
   assert.equal(fs.readFileSync(output,'utf8'),'old sentinel');assert(!fs.existsSync(started));
  }finally{fs.writeFileSync(file,bytes);}
 });
});

test('actual renderer and ffmpeg reject a post-encode source edit without replacing the movie',{skip:spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status!==0},()=>{
 withSourceFixture(root=>{
  const bin=path.join(root,'encoder-bin');fs.mkdirSync(bin);
  // Resolve ffmpeg before prepending the wrapper to PATH, then use the same
  // real installed encoder. The wrapper edits source only after encoding exits.
  fs.writeFileSync(path.join(bin,'ffmpeg'),`#!/usr/bin/env node
import fs from 'node:fs';import {spawnSync} from 'node:child_process';
const result=spawnSync('ffmpeg',process.argv.slice(2),{stdio:'inherit',env:{...process.env,PATH:process.env.ORIGINAL_ENCODER_PATH}});
if(result.status===0&&!process.argv.includes('-version'))fs.appendFileSync(process.env.MUTATION_TARGET,'\\n');
process.exit(result.status??1);
`);fs.chmodSync(path.join(bin,'ffmpeg'),0o755);
  const target=path.join(root,'production/assets/card_red.svg'),original=fs.readFileSync(target);
  const output=path.join(root,'film.mp4');fs.writeFileSync(output,'previous movie');
  const result=spawnSync(process.execPath,['--import',path.join(root,'scripts/isolated-fonts.mjs'),path.join(root,'production/render.mjs'),'--placeholder-cast','--duration','.04','--out',output],{cwd:root,encoding:'utf8',timeout:60000,env:{...process.env,PYTHON:pythonCommand(),PATH:`${bin}${path.delimiter}${process.env.PATH}`,ORIGINAL_ENCODER_PATH:process.env.PATH,MUTATION_TARGET:target}});
  assert.ifError(result.error);assert.notEqual(result.status,0,result.stdout);
  assert.match(result.stderr,/Video encoding stopped: Render inputs changed/,'Must fail at source publication guard after real font, asset, draw and encode work.');
  assert.deepEqual(fs.readFileSync(target),Buffer.concat([original,Buffer.from('\n')]));
  assert.equal(fs.readFileSync(output,'utf8'),'previous movie');
  assert.deepEqual(fs.readdirSync(root).filter(name=>name.startsWith('.film')),[]);
 });
});
