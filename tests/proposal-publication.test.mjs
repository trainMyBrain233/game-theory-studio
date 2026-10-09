import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {withSourceFixture} from '../scripts/source-fixture.mjs';
import {pythonCommand} from '../scripts/python.mjs';

const styles=['editorial','textbook','bright'];
const names=styles.flatMap(style=>[
 `frames/${style}_participants_1920x1080.png`,
 `frames/${style}_payoff_1920x1080.png`,
 `boards/${style}_comparison_3840x1320.png`,
]).concat('qa/render-manifest.json');
function snapshot(directory){
 return Object.fromEntries(fs.readdirSync(directory,{recursive:true}).sort().map(name=>{
  const file=path.join(directory,name),info=fs.lstatSync(file);
  return [name,info.isDirectory()?'directory':fs.readFileSync(file)];
 }));
}
function seed(root,mixed=false){
 const directory=path.join(root,'design');
 for(const [index,name] of names.entries()){
  const file=path.join(directory,name);fs.mkdirSync(path.dirname(file),{recursive:true});
  if(!mixed||index%2===0)fs.writeFileSync(file,Buffer.from([index,0,255,128,42]));
 }
 fs.writeFileSync(path.join(directory,'boards','user-file'),'keep');
}
function run(root,hook=''){
 const preload=path.join(root,'proposal-publication-injection.mjs');fs.writeFileSync(preload,`import fs from 'node:fs';\n${hook}`);
 return spawnSync(process.execPath,['--import',preload,'--import','./scripts/isolated-fonts.mjs','design/render-proposals.mjs'],{
  cwd:root,encoding:'utf8',env:{...process.env,PYTHON:pythonCommand()},timeout:60000,maxBuffer:2*1024*1024,
 });
}
for(const existing of [false,true])test(`late valid scene text with unrenderable layout preserves ${existing?'existing':'absent'} output set`,()=>withSourceFixture(root=>{
 if(existing)seed(root);
 const file=path.join(root,'design/scenes.json'),data=JSON.parse(fs.readFileSync(file));
 data.frames.find(frame=>frame.id==='payoff').title='甲'.repeat(100);fs.writeFileSync(file,JSON.stringify(data));
 const directory=path.join(root,'design'),before=snapshot(directory),result=run(root);
 assert.equal(result.status,1,result.stdout+result.stderr);
 assert.match(result.stderr,/Text requires more than two lines|Text outside canvas/);
 assert.doesNotMatch(result.stderr,/label must|FontTools|ModuleNotFoundError/,'Must reach real layout rejection, not schema or interpreter failure');
 assert.equal(result.stdout,'','Do not report frame publication when a later layout fails');
 assert.deepEqual(snapshot(directory),before,'No frames, boards, metadata, directories or unrelated files may change');
}));
for(const mixed of [false,true])test(`late manifest replacement failure restores the entire ${mixed?'mixed':'existing'} proposal set`,()=>withSourceFixture(root=>{
 seed(root,mixed);
 const directory=path.join(root,'design'),before=snapshot(directory);
 const result=run(root,`const real=fs.renameSync;let failed=false;fs.renameSync=(source,target,...rest)=>{
  if(!failed&&String(source).includes('/new/qa/render-manifest.json')){failed=true;throw Error('INJECTED_LATE_MANIFEST_REPLACEMENT');}
  return real(source,target,...rest);
 };`);
 assert.equal(result.status,1,result.stdout+result.stderr);assert.match(result.stderr,/INJECTED_LATE_MANIFEST_REPLACEMENT/);
 assert.equal(result.stdout,'','Publication paths must only be logged after the whole set succeeds');
 assert.deepEqual(snapshot(directory),before,'Restore all original binary bytes and metadata; remove new products and staging files');
}));

test('successful proposal publication preserves native frame/board PNG bytes and manifest bounds',()=>withSourceFixture(root=>{
 const result=run(root);assert.equal(result.status,0,result.stdout+result.stderr);
 const check=spawnSync(process.execPath,['--import','./scripts/isolated-fonts.mjs','--input-type=module','-e',`
  import assert from 'node:assert/strict';import fs from 'node:fs';
  import {createCanvas,loadImage} from '@napi-rs/canvas';
  import {DATA,TOKENS,drawScene,drawComparisonHeader} from './design/render-proposals.mjs';
  import {COMPARISON_BOARD} from './design/comparison-board-text.mjs';
  const manifest=JSON.parse(fs.readFileSync('design/qa/render-manifest.json'));
  assert.equal(manifest.images.length,6);assert.equal(manifest.width,1920);assert.equal(manifest.height,1080);
  for(const style of Object.keys(TOKENS.styles)){
   for(const scene of DATA.frames){
    const canvas=createCanvas(1920,1080),bounds=drawScene(canvas,style,scene.id);
    const file='frames/'+style+'_'+scene.id+'_1920x1080.png';
    assert.deepEqual(fs.readFileSync('design/'+file),canvas.toBuffer('image/png'));
    assert.deepEqual(manifest.images.find(image=>image.file===file).textBounds,bounds);
   }
   // Reproduce the previous compositor: decode the published frame files.
   const board=createCanvas(COMPARISON_BOARD.width,COMPARISON_BOARD.height);drawComparisonHeader(board,style);
   for(const [index,scene] of DATA.frames.entries())board.getContext('2d').drawImage(await loadImage('design/frames/'+style+'_'+scene.id+'_1920x1080.png'),index*1920,COMPARISON_BOARD.headerHeight);
   assert.deepEqual(fs.readFileSync('design/boards/'+style+'_comparison_3840x1320.png'),board.toBuffer('image/png'));
  }
 `],{cwd:root,encoding:'utf8',env:{...process.env,PYTHON:pythonCommand()},timeout:60000});
 assert.equal(check.status,0,check.stdout+check.stderr);
 assert.deepEqual(result.stdout.trim().split('\n'),names.filter(name=>name.startsWith('frames/')));
 assert.ok(!fs.readdirSync(path.join(root,'design')).some(name=>name.startsWith('.publication-')));
}));
