import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {pythonCommand} from '../scripts/python.mjs';
const file=p=>new URL(p,import.meta.url).pathname;
function frames(segment,offsets,extra={}){
 const result=spawnSync(process.execPath,['--import',file('../scripts/isolated-fonts.mjs'),...(extra.AXIS_MUTATION?['--loader',file('./fixtures/matrix-axis-negative-loader.mjs')]:[]),file('./fixtures/matrix-axis-native-frame.mjs')],{encoding:'utf8',timeout:180000,env:{...process.env,PYTHON:pythonCommand(),AXIS_SEGMENT:segment,AXIS_BATCH_OFFSETS:JSON.stringify(offsets),...extra}});
 return result;
}
const windows=[
 ['s21_rows',[-.45,-.345,-.24,-.17,-.135,-.10166666666667,-.1,-.06333333333333]],
 ['s21_rows',[-.06333333333333,-.03,-.03+1/30,0,.1,.4,.7,1.3]],
 ['s34_intro',[-1/30,0,.2875,.575,.63,.69,.71666666666667,.75]],
 ['s34_intro',[.78333333333333,.8625,1.15,1.15+1/30]],
];
for(const long of ['', '1'])for(const [index,[segment,offsets]] of windows.entries())test(`native all-text/all-route clearance ${long?'four-character names':'default'} ${segment} batch ${index}`,()=>{
 const r=frames(segment,offsets,{AXIS_LONG:long,AXIS_LONG_NAMES:long});assert.equal(r.status,0,r.stdout+r.stderr+(r.error??''));
});
test('native clearance regression detects retiring desk even at alpha 1/255',()=>{
 const r=frames('s21_rows',[-.06333333333333],{AXIS_MUTATION:'desk-exit',AXIS_EXPECT_FAINT_DESK:'1'});
 assert.notEqual(r.status,0);assert.match(r.stderr,/line_text_clearance/);assert.match(r.stderr,/0\.00392156862745098/);
});
test('native clearance regression detects actor-name crossing moving matrix border',()=>{
 const r=frames('s34_intro',[.75],{AXIS_MUTATION:'owner-grid',AXIS_LONG_NAMES:'1'});
 assert.notEqual(r.status,0);assert.match(r.stderr,/line_text_clearance/);
});
