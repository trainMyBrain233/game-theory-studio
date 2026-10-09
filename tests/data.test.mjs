import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {ROOT,pythonCommand} from '../scripts/python.mjs';
import {readJSON,validateSchema,validateScenes,validateTimeline} from '../scripts/validate-data.mjs';
import {createChapter} from '../scripts/new-chapter.mjs';

const scenes=readJSON(path.join(ROOT,'design/scenes.json'));
const timeline=readJSON(path.join(ROOT,'chapters/01-four-elements/narration/timeline.json'));
test('authored scene, timeline and chapter contracts',()=>{
  validateScenes(scenes);validateTimeline(timeline,scenes);
  validateSchema('chapter',readJSON(path.join(ROOT,'chapters/01-four-elements/chapter.json')));
});
test('scene configuration supports independent player labels, strategy names, payoffs and selection',()=>{
  const data=structuredClone(scenes);
  data.actors[0].label='甲';data.actors[1].label='乙';
  data.strategies[0].label='合作';data.strategies[1].label='退出';
  data.payoffs=[[[11,12],[21,22]],[[31,32],[41,42]]];
  data.selected={row:1,column:0,actorA:'blue',actorB:'red'};
  validateScenes(data);
});
for(const [name,mutate] of [
  ['out-of-range selection',x=>{x.selected.row=2;}],
  ['contradictory strategy reference',x=>{x.selected.actorA=x.strategies[1-x.selected.row].id;}],
  ['duplicate actor ids',x=>{x.actors[1].id='A';}],
  ['duplicate frame ids',x=>{x.frames[1].id='participants';}],
  ['ambiguous player labels',x=>{x.actors[1].label=x.actors[0].label;}],
  ['unsupported long player label',x=>{x.actors[0].label='无法排下的参与者名字';}],
  ['unknown field',x=>{x.secretField=true;}],
]) test(`scene rejects ${name}`,()=>{const x=structuredClone(scenes);mutate(x);assert.throws(()=>validateScenes(x));});
for(const [name,mutate] of [
  ['mismatched payoff ownership',x=>{const pair=x.visual_contract.matrix_values.RB;pair[0]=pair[0]===0?1:0;}],
  ['negative window',x=>{x.segments[0].end=-1;}],
  ['doubled tail pause',x=>{x.segments[0].end+=x.segments[0].pause_after;}],
  ['discontinuous section',x=>{x.sections[1].start+=0.1;}],
  ['unknown score owner',x=>{x.segments.find(s=>s.visual_cue.score_reveals).visual_cue.score_reveals[0].player='C';}],
  ['reversed choices',x=>{const cue=x.segments.find(s=>s.visual_cue.matrix_cell==='RB'&&s.visual_cue.choices).visual_cue;cue.choices={A:scenes.strategies[1].label,B:scenes.strategies[0].label};}],
  ['unknown cell without score reveal',x=>{x.segments[0].visual_cue.matrix_cell='XY';}],
  ['score mismatched without score_reveals',x=>{x.segments[0].visual_cue={action:'reveal_scores',matrix_cell:'RB',scores:[5,0]};}],
  ['score event outside speech',x=>{x.segments.find(s=>s.visual_cue.score_reveals).visual_cue.score_reveals[0].offset=99;}],
  ['omitted reveal list',x=>{delete x.segments.find(s=>s.visual_cue.action==='reveal_scores').visual_cue.score_reveals;}],
  ['empty reveal list',x=>{x.segments.find(s=>s.visual_cue.action==='reveal_scores').visual_cue.score_reveals=[];}],
  ['single player reveal',x=>{x.segments.find(s=>s.visual_cue.action==='reveal_scores').visual_cue.score_reveals.pop();}],
  ['duplicate score owner',x=>{const cue=x.segments.find(s=>s.visual_cue.matrix_cell==='RR'&&s.visual_cue.score_reveals).visual_cue;cue.score_reveals[1].player='A';}],
  ['empty referenced section',x=>{x.sections.push({id:'unused',title:'空章节',start:x.duration,end:x.duration+1});}],
  ['duplicate section id',x=>{x.sections[1].id=x.sections[0].id;}],
  ['subtitle/voiceover disagreement',x=>{x.segments[0].voiceover='不一致';}],
]) test(`timeline rejects ${name}`,()=>{const x=structuredClone(timeline);mutate(x);assert.throws(()=>validateTimeline(x,scenes));});
test('timeline accepts reordered A/B reveal events with unchanged ownership and timing',()=>{
 const reordered=structuredClone(timeline);
 for(const segment of reordered.segments)segment.visual_cue.score_reveals?.reverse();
 validateTimeline(reordered,scenes);
});
test('tokens allow supported typography and reject unsupported geometry instead of ignoring it',()=>{
  const tokens=readJSON(path.join(ROOT,'design/tokens.json'));
  tokens.canvas.subtitleFont=48;tokens.styles.textbook.titleFamily='serif';validateSchema('tokens',tokens);
  tokens.canvas.safeMargin=1;assert.throws(()=>validateSchema('tokens',tokens));
});
test('chapter scaffold rejects traversal and refuses overwrite',()=>{
  assert.throws(()=>createChapter('../escape','标题'));
  assert.throws(()=>createChapter('01-four-elements','标题'),/already exists/);
});
test('chapter scaffold creates reproducible original non-IP text in an isolated root',()=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'studio-chapter-'));
  try{
    fs.mkdirSync(path.join(temporary,'chapters'));fs.mkdirSync(path.join(temporary,'scripts'));
    for(const script of ['narration_io.py','case_data.py','text_contract.py','unicode-text-15.0.0.json'])fs.copyFileSync(path.join(ROOT,'scripts',script),path.join(temporary,'scripts',script));
    fs.cpSync(path.join(ROOT,'design/scenes.json'),path.join(temporary,'design/scenes.json'));
    const directory=createChapter('02-original-test','共同选择测试',temporary);
    const produced=readJSON(path.join(directory,'narration/timeline.json'));
    validateTimeline(produced,scenes);assert.equal(produced.segments.length,2);
    const before=fs.readFileSync(path.join(directory,'narration/timeline.json'));
    const build=spawnSync(pythonCommand(),[path.join(directory,'narration/build_narration.py')],{cwd:ROOT});
    assert.equal(build.status,0,build.stderr?.toString());
    assert.deepEqual(fs.readFileSync(path.join(directory,'narration/timeline.json')),before);
  }finally{fs.rmSync(temporary,{recursive:true,force:true});}
});
test('QA comparison fails on a stale subtitle without modifying the inspected file',()=>{
  // Run against an isolated copy so the repository remains untouched, even when this test fails.
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'studio-readonly-'));
  try{
    for(const dir of ['chapters','schemas','scripts','assets/characters'])fs.cpSync(path.join(ROOT,dir),path.join(temporary,dir),{recursive:true,filter:source=>!source.includes('__pycache__')});
    fs.cpSync(path.join(ROOT,'design/scenes.json'),path.join(temporary,'design/scenes.json'));
    fs.cpSync(path.join(ROOT,'design/tokens.json'),path.join(temporary,'design/tokens.json'));
    fs.symlinkSync(path.join(ROOT,'node_modules'),path.join(temporary,'node_modules'),'dir');
    const subtitle=path.join(temporary,'chapters/01-four-elements/narration/game_theory_v2_zh.srt');
    fs.writeFileSync(subtitle,fs.readFileSync(subtitle,'utf8').replace('00:00:06,500','00:00:06,600'));
    const before=fs.readFileSync(subtitle);
    const qa=spawnSync(process.execPath,[path.join(temporary,'scripts/qa-data.mjs')],{cwd:temporary,env:{...process.env,PYTHON:pythonCommand()},encoding:'utf8'});
    assert.notEqual(qa.status,0);assert.match(qa.stderr,/is stale/);
    assert.deepEqual(fs.readFileSync(subtitle),before);
  }finally{fs.rmSync(temporary,{recursive:true,force:true});}
});
test('changed case drives authored narration, subtitle text and score events together',()=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'studio-content-'));
  try{
    for(const directory of ['chapters','scripts'])fs.cpSync(path.join(ROOT,directory),path.join(temporary,directory),{recursive:true,filter:source=>!source.includes('__pycache__')});
    const changed=structuredClone(scenes);
    changed.actors[0].label='甲';changed.actors[1].label='乙';
    changed.strategies[0].label='合作';changed.strategies[1].label='退出';
    changed.payoffs=[[[11,12],[21,22]],[[31,32],[41,42]]];
    fs.mkdirSync(path.join(temporary,'design'));
    fs.writeFileSync(path.join(temporary,'design/scenes.json'),JSON.stringify(changed));
    const base=path.join(temporary,'chapters/01-four-elements/narration');
    const result=spawnSync(pythonCommand(),[path.join(base,'build_narration.py')],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const produced=readJSON(path.join(base,'timeline.json'));
    validateTimeline(produced,changed);
    assert(produced.segments.some(segment=>segment.voiceover==='甲得二十一分，乙得二十二分。'));
    assert(produced.segments.some(segment=>segment.voiceover==='甲得三十一分，乙得三十二分。'));
    assert(produced.segments.some(segment=>segment.visual_cue.choices?.A==='合作' && segment.visual_cue.choices?.B==='退出'));
    assert(produced.segments.every(segment=>!segment.text.includes('小A') && !segment.text.includes('小B')));
  }finally{fs.rmSync(temporary,{recursive:true,force:true});}
});
