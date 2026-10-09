import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {pythonCommand} from '../scripts/python.mjs';
const file=p=>new URL(p,import.meta.url).pathname;
function frames(segment,offsets,extra={}){
 const result=spawnSync(process.execPath,['--import',file('../scripts/isolated-fonts.mjs'),...(extra.AXIS_MUTATION?['--loader',file('./fixtures/matrix-axis-negative-loader.mjs')]:[]),file('./fixtures/matrix-axis-native-frame.mjs')],{encoding:'utf8',timeout:180000,env:{...process.env,PYTHON:pythonCommand(),AXIS_SEGMENT:segment,AXIS_BATCH_OFFSETS:JSON.stringify(offsets),...extra}});
 return result;
}
const timeline=JSON.parse(fs.readFileSync(new URL('../chapters/01-four-elements/narration/timeline.json',import.meta.url),'utf8'));
const segment=id=>timeline.segments.find(s=>s.id===id);
const selectedOffsets=[['s24_rr_select',null],['s25_rr_score',null],['s27_rb_score',null],['s25_rr_score',1],['s27_rb_score',1],['s29_br_score',1],['s31_bb_score',1]].map(([id,offset])=>{const s=segment(id);return s.start+(offset??(s.end-s.start)*.6)-segment('s23_score_order').start;});
const windows=[
 ['s21_rows',[-.45,-.345,-.24,-.17,-.135,-.10166666666667,-.1,-.06333333333333]],
 ['s21_rows',[-.06333333333333,-.03,-.03+1/30,0,.1,.4,.7,1.3]],
 ['s34_intro',[-1/30,0,.2875,.575,.63,.69,.71666666666667,.75]],
 ['s34_intro',[.78333333333333,.8625,1.15,1.15+1/30]],
 ['s23_score_order',selectedOffsets],
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

test('native clearance regression detects long row strategy crowding selected-row indicator',()=>{
 const r=frames('s25_rr_score',[1],{AXIS_MUTATION:'row-gutter',AXIS_LONG:'1',AXIS_LONG_NAMES:'1'});
 assert.notEqual(r.status,0);assert.match(r.stderr,/line_text_clearance/);assert.match(r.stderr,/共同合作/);assert.match(r.stderr,/757/);
});

test('native clearance regression detects owner name overlapping shifted row card',()=>{
 const r=frames('s25_rr_score',[1],{AXIS_MUTATION:'owner-card',AXIS_LONG:'1',AXIS_LONG_NAMES:'1'});
 assert.notEqual(r.status,0);assert.match(r.stderr,/actor name ink overlaps card cue/);
});
