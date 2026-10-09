import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {withSourceFixture} from '../scripts/source-fixture.mjs';
import {pythonCommand} from '../scripts/python.mjs';

test('CLI preflights all comparison text before creating or overwriting any render artifact',()=>withSourceFixture(root=>{
 const tokenFile=path.join(root,'design/tokens.json'),original=JSON.parse(fs.readFileSync(tokenFile));
 const outputs=['design/qa','design/frames','design/boards'].map(relative=>path.join(root,relative));
 for(const output of outputs)assert(!fs.existsSync(output));
 const options={cwd:root,encoding:'utf8',env:{...process.env,PYTHON:pythonCommand()},timeout:30000,maxBuffer:2*1024*1024};
 for(const [id,change,pattern] of [
  ['editorial',{name:'甲'.repeat(100)},/Text outside canvas/],
  ['bright',{subtitle:'乙'.repeat(110)},/Text outside canvas/],
  ['textbook',{name:'甲'.repeat(35),subtitle:'乙'.repeat(50)},/Text collision/],
 ]){
  const tokens=structuredClone(original);Object.assign(tokens.styles[id],change);fs.writeFileSync(tokenFile,JSON.stringify(tokens));
  const result=spawnSync(process.execPath,['--import','./scripts/isolated-fonts.mjs','design/render-proposals.mjs'],options);
  assert.equal(result.status,1,result.stdout+result.stderr);assert.match(result.stderr,pattern);
  assert.equal(result.stdout,'','No frame path may be published before all headers pass');
  for(const output of outputs)assert(!fs.existsSync(output),`Invalid header created ${path.relative(root,output)}`);
 }
 // Existing artifacts must also remain byte-identical on a rejected rerun.
 const sentinels=outputs.map(output=>{fs.mkdirSync(output,{recursive:true});const file=path.join(output,'keep.bin');fs.writeFileSync(file,'existing render bytes');return file;});
 const result=spawnSync(process.execPath,['--import','./scripts/isolated-fonts.mjs','design/render-proposals.mjs'],options);
 assert.equal(result.status,1,result.stdout+result.stderr);assert.match(result.stderr,/Text collision/);
 for(const file of sentinels){assert.equal(fs.readFileSync(file,'utf8'),'existing render bytes');assert.deepEqual(fs.readdirSync(path.dirname(file)),['keep.bin']);}
}));
