import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {pythonCommand} from '../scripts/python.mjs';
const file=p=>new URL(p,import.meta.url).pathname;
function frame(scale,fraction,legacy=false){
 const args=['--import',file('../scripts/isolated-fonts.mjs')];
 if(legacy)args.push('--loader',file('./fixtures/four-questions-legacy-loader.mjs'));
 args.push(file('./fixtures/four-questions-native-frame.mjs'));
 const p=spawnSync(process.execPath,args,{encoding:'utf8',timeout:60000,env:{...process.env,PYTHON:pythonCommand(),FOUR_QUESTIONS_SCALE:String(scale),FOUR_QUESTIONS_FRACTION:String(fraction)}});
 assert.equal(p.status,0,p.stdout+p.stderr+(p.error??''));return JSON.parse(p.stdout.trim().split('\n').at(-1));
}
test('native compressed hold contains all four fully opaque, settled glyph regions; old renderer fails',()=>{
 const fixed=frame(.3,.8),broken=frame(.3,.8,true);
 assert.deepEqual(fixed.alpha,[1,1,1,1]);assert.deepEqual(fixed.pixelsMatch,[true,true,true,true]);
 assert(broken.alpha[3]<1);assert.equal(broken.pixelsMatch[3],false);
});
test('native default entrance, hold and exit pixels exactly match pre-fix renderer',()=>{
 for(const fraction of [.2,.8,.965])assert.equal(frame(1,fraction).hash,frame(1,fraction,true).hash,`default ${fraction}`);
});
