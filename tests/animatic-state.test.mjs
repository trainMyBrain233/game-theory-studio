import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compilePlan,resolveFrame} from '../production/src/animatic/semantic-state.mjs';
const fixture=()=>JSON.parse(fs.readFileSync(new URL('./fixtures/animatic/minimal-plan.json',import.meta.url),'utf8'));
const compiled=compilePlan(fixture());

test('animatic schema compiles five continuous synthetic blocks with one immutable case',()=>{
 assert.equal(compiled.plan.blocks.length,5);assert.equal(compiled.plan.durationFrames,360);
 assert(Object.isFrozen(compiled.plan.caseData.values.RR));
 const input=fixture(),copy=compilePlan(input);input.caseData.values.RR[0]=99;
 assert.equal(resolveFrame(copy,90).revealedScores.RR[0],2);
 assert.throws(()=>resolveFrame(copy,90).revealedScores.RR[0]=99,TypeError);
});
test('every event/phase before, exact and after frame has independently expected state',()=>{
 for(let frame=0;frame<360;frame++){
  const state=resolveFrame(compiled,frame);
  const expectedPhase=frame<60?'intro_caption':frame<80?'rr_choice':frame<120?'rr_result':frame<150?'rb_choice':frame<200?'rb_result':frame<240?'compare_red':frame<280?'compare_blue':'summary_caption';
  const active=frame>=70&&frame<120?'RR':frame>=140&&frame<200?'RB':frame>=220&&frame<240?'RR':frame>=260&&frame<280?'RB':null;
  assert.equal(state.phaseId,expectedPhase,`phase at ${frame}`);assert.equal(state.activeCell,active,`focus at ${frame}`);
  assert.deepEqual(state.revealedScores,{RR:[frame>=90?2:null,frame>=100?7:null],RB:[frame>=160?1:null,frame>=170?9:null],BR:[null,null],BB:[null,null]},`score at ${frame}`);
  assert.equal(state.rowFocus,frame>=200&&frame<280?'red':null);
 }
});
test('joint reveal information and card visibility share the same integer-frame state',()=>{
 for(let frame=0;frame<60;frame++){
  const {information}=resolveFrame(compiled,frame);
  assert.equal(information.phase,frame<20||frame>=50?'hidden':frame<40?'revealing':'visible');
  assert.equal(information.revealProgress,frame<20||frame>=50?0:Math.min(1,(frame-20)/20));
  assert.equal(information.choicesVisible,frame>=40&&frame<50);
 }
});
test('new combination and new comparison phrase clear the old frame while preserving numbers',()=>{
 for(const [before,at,after] of [[119,120,121],[199,200,201],[239,240,241],[279,280,281]]){
  assert(resolveFrame(compiled,before).activeCell);assert.equal(resolveFrame(compiled,at).activeCell,null);assert.equal(resolveFrame(compiled,after).activeCell,null);
  assert.deepEqual(resolveFrame(compiled,before).revealedScores,resolveFrame(compiled,at).revealedScores);
 }
});
test('cold repeated/reversed requests and equivalent same-frame owner order resolve identically',()=>{
 const expected=Array.from({length:360},(_,frame)=>resolveFrame(compiled,frame));
 for(const frame of Array.from({length:360},(_,i)=>359-i).concat([20,40,70,100,120,240]))assert.deepEqual(resolveFrame(compiled,frame),expected[frame]);
 const input=fixture();input.blocks[1].events[2].frame=90;
 const first=compilePlan(input);input.blocks[1].events.reverse();const second=compilePlan(input);
 for(const frame of [89,90,91])assert.deepEqual(resolveFrame(first,frame),resolveFrame(second,frame));
});
test('complete subtitle group remains fixed through its full display/tail window',()=>{
 for(const phase of compiled.phases)for(let frame=phase.startFrame;frame<phase.endFrame;frame++)assert.deepEqual(resolveFrame(compiled,frame).caption.lines,phase.lines);
 assert.equal(resolveFrame(compiled,359).phaseId,'summary_caption');
});
test('case replacement drives revealed values and names without a second numeric source',()=>{
 const input=fixture();input.caseData.values.RR=[12,34];input.caseData.players.A.name='新甲';
 input.blocks[1].subtitles[1].lines=['甲方得十二分，乙方得三十四分。'];input.blocks[3].subtitles[0].lines=['对方选红，甲方得十二分；'];
 for(const block of input.blocks)block.voiceover=block.subtitles.flatMap(phase=>phase.lines).join('');
 for(const b of input.blocks){b.voiceover=b.voiceover.replaceAll('甲方','新甲');for(const p of b.subtitles)p.lines=p.lines.map(line=>line.replaceAll('甲方','新甲'));}
 const next=compilePlan(input);assert.deepEqual(resolveFrame(next,100).revealedScores.RR,[12,34]);assert.equal(next.plan.caseData.players.A.name,'新甲');
});
for(const [label,mutate] of [
 ['fractional frame',p=>p.blocks[0].events[0].frame=.5],
 ['unsafe frame',p=>p.durationFrames=Number.MAX_SAFE_INTEGER+1],
 ['unsupported fps',p=>p.fps=24],['unsupported width',p=>p.width=1280],
 ['pretend audio timing',p=>p.audioTiming={aligned:true}],['unknown action',p=>p.blocks[0].events[0].type='magic'],
 ['duplicate block',p=>p.blocks[1].id=p.blocks[0].id],['duplicate phase',p=>p.blocks[1].subtitles[0].id='intro_caption'],
 ['duplicate event',p=>p.blocks[1].events[0].id='open'],['missing block',p=>p.blocks.splice(1,1)],
 ['gap',p=>p.blocks[1].startFrame++],['missing subtitle tail',p=>p.blocks[0].subtitles[0].endFrame--],
 ['event at exclusive end',p=>p.blocks[0].events[0].frame=60],['foreign phase',p=>p.blocks[0].events[0].phaseId='rr_choice'],
 ['unknown phase',p=>p.blocks[0].events[0].phaseId='missing'],['missing owner',p=>p.blocks[1].events.pop()],
 ['duplicate owner',p=>p.blocks[1].events[2].owner='A'],['wrong owner axis',p=>p.caseData.players.B.axis='row'],
 ['wrong score cell',p=>p.blocks[1].events[1].cell='RB'],['second score value source',p=>p.blocks[1].events[1].value=88],
 ['wrong focus',p=>p.blocks[2].events[0].cell='RR'],['stale comparison scope',p=>p.blocks[3].subtitles[1].focus.scope='rb_choice'],
 ['wrong row',p=>p.blocks[3].subtitles[0].focus.rowChoice='blue'],['unknown scope',p=>p.blocks[1].subtitles[0].focus.scope='missing'],
 ['no-focus residue',p=>p.blocks[4].subtitles[0].focus.expectedCell='RR'],
 ['long line',p=>p.blocks[0].subtitles[0].lines=['甲'.repeat(23)]],
 ['third line',p=>p.blocks[0].subtitles[0].lines=['甲方','乙方','选牌']],
 ['incomplete caption',p=>p.blocks[0].subtitles[0].lines=['选牌。']],
 ['split name',p=>p.blocks[0].subtitles[0].lines=['甲','方和乙方各自选牌，一起亮牌。']],
 ['split number unit',p=>p.blocks[1].subtitles[1].lines=['甲方得二','分，乙方得七分。']],
 ['resumed stale case scope',p=>{p.blocks[3].subtitles[0].focus={kind:'case',expectedCell:'RR',scope:'rr_choice',rowChoice:null};}],
 ['reveal outside phase',p=>p.blocks[0].events[0].durationFrames=40],
 ['conflicting card phases',p=>p.blocks[0].events[1].frame=30],
])test(`animatic rejects ${label}`,()=>{const input=fixture();mutate(input);assert.throws(()=>compilePlan(input));});
test('invalid and endpoint frame requests fail rather than falling back to last caption',()=>{
 for(const frame of [-1,.5,360,361,NaN,Infinity,'0',Number.MAX_SAFE_INTEGER+1])assert.throws(()=>resolveFrame(compiled,frame));
 assert.throws(()=>resolveFrame(structuredClone(compiled),0),/compilePlan/);
});
