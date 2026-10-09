import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {pythonCommand} from '../scripts/python.mjs';
const file=p=>new URL(p,import.meta.url).pathname;
function frame(env={},loader=false){return spawnSync(process.execPath,['--import',file('../scripts/isolated-fonts.mjs'),...(loader?['--loader',file('./fixtures/matrix-axis-negative-loader.mjs')]:[]),file('./fixtures/matrix-axis-native-frame.mjs')],{encoding:'utf8',timeout:90000,env:{...process.env,PYTHON:pythonCommand(),...env}})}
for(const long of ['', '1'])for(const segment of ['s19_question','s20_definition','s21_rows','s22_columns','s23_score_order','s24_rr_select','s25_rr_score','s27_rb_score','s29_br_score','s31_bb_score','s32_joint_choices','s34_intro','s35_first_pair'])test(`native matrix axes retain readable recorded strategy ink: ${long?'long':'default'} ${segment}`,()=>{
 const result=frame({AXIS_LONG:long,AXIS_SEGMENT:segment});assert.equal(result.status,0,result.stdout+result.stderr);
});
for(const mutation of ['small','omit','swap','ink','card','leader'])test(`native matrix axis regression rejects ${mutation}`,()=>{
 const result=frame({AXIS_MUTATION:mutation,...(mutation==='leader'?{AXIS_SEGMENT:'s25_rr_score'}:{})},true);assert.notEqual(result.status,0);assert.match(result.stderr,mutation==='small'?/below 30px/:mutation==='omit'?/all four row\/column/:mutation==='ink'?/native glyph ink/:mutation==='card'?/overlaps a card cue/:mutation==='leader'?/overlaps a horizontal leader/:/strategy semantics/);
});
test('oversized strategies fail explicitly without shrinking',()=>{const r=frame({AXIS_TOO_LONG:'1'});assert.notEqual(r.status,0);assert.match(r.stderr,/Matrix axis strategy label exceeds/)});

// Explicit entrance start, quarter points, end and adjacent frames for both
// changed migrations, rather than only settled segment snapshots.
for(const [segment,start,duration] of [['s21_rows',.1,1.2],['s34_intro',0,1.15]])
 for(const offset of [start-1/24,start,...[.25,.5,.75,1].map(f=>start+duration*f),start+duration+1/24])test(`long matrix transition ${segment} +${offset.toFixed(4)}`,()=>{
  const r=frame({AXIS_LONG:'1',AXIS_SEGMENT:segment,AXIS_OFFSET:String(offset)});assert.equal(r.status,0,r.stdout+r.stderr);
 });

for(const [segment,offset] of [['s23_score_order',1],['s25_rr_score',1],['s27_rb_score',1],['s29_br_score',1],['s31_bb_score',1],['s34_intro',.2875],['s34_intro',.575],['s34_intro',.63],['s34_intro',.69],['s34_intro',.8625],['s35_first_pair',1]])test(`supported four-character owner names ${segment} +${offset}`,()=>{
 const r=frame({AXIS_LONG:'1',AXIS_LONG_NAMES:'1',AXIS_SEGMENT:segment,AXIS_OFFSET:String(offset)});assert.equal(r.status,0,r.stdout+r.stderr);
});

test('native four-character owner regression rejects badge collision',()=>{
 const r=frame({AXIS_MUTATION:'owner',AXIS_LONG_NAMES:'1',AXIS_SEGMENT:'s34_intro',AXIS_OFFSET:'.575'},true);assert.notEqual(r.status,0);assert.match(r.stderr,/actor name ink overlaps owner badge/);
});

test('native four-character owner regression rejects merged column name',()=>{
 const r=frame({AXIS_MUTATION:'owner-column',AXIS_LONG:'1',AXIS_LONG_NAMES:'1',AXIS_SEGMENT:'s34_intro',AXIS_OFFSET:'.575'},true);assert.notEqual(r.status,0);assert.match(r.stderr,/column strategy needs 16px separation/);
});
