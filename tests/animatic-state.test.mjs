import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {rebuildNarration} from './fixtures/animatic/rebuild-narration.mjs';
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
 rebuildNarration(input);
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

for(const [label,mutate] of [
 ['player',plan=>plan.caseData.players.A.name='新甲'],
 ['strategy',plan=>plan.caseData.strategies.red='合作'],
 ['payoff',plan=>plan.caseData.values.RR[0]=12],
])test(`case-only ${label} replacement rejects two mutually matching stale narration products`,()=>{
 const plan=fixture();mutate(plan);assert.throws(()=>compilePlan(plan),/Stale narration/);
 rebuildNarration(plan);compilePlan(plan);
});
test('one semantic case rebuild drives changed names, strategies, asymmetric spoken numbers and state together',()=>{
 const plan=fixture();plan.caseData.players.A.name='参与甲';plan.caseData.players.B.name='参与乙';plan.caseData.strategies={red:'合作',blue:'退出'};plan.caseData.values.RR=[12,34];
 rebuildNarration(plan);const next=compilePlan(plan);
 assert.deepEqual(resolveFrame(next,100).revealedScores.RR,[12,34]);
 assert.equal(resolveFrame(next,70).caption.lines.join(''),'参与甲选合作，参与乙选合作。');
 assert.equal(resolveFrame(next,100).caption.lines.join(''),'参与甲得十二分，参与乙得三十四分。');
 assert.equal(resolveFrame(next,220).caption.lines.join(''),'参与乙选合作，参与甲得十二分；');
 const changed=structuredClone(plan);changed.blocks[1].subtitles[1].lines=['参与甲得零分，参与乙得零分。'];changed.blocks[1].voiceover=changed.blocks[1].subtitles.flatMap(phase=>phase.lines).join('');assert.throws(()=>compilePlan(changed),/Stale narration/);
});
test('strategy words remain indivisible across both lines and subtitle groups',()=>{
 const plan=fixture(),phase=plan.blocks[1].subtitles[0];phase.lines=['甲方选红','牌，乙方选红牌。'];assert.throws(()=>compilePlan(plan),/splits protected token/);
 const grouped=fixture(),original=grouped.blocks[1].subtitles[0];const next=structuredClone(original);original.endFrame=65;original.lines=['甲方选红'];next.id='split_choice';next.startFrame=65;next.lines=['牌，乙方选红牌。'];grouped.blocks[1].subtitles.splice(1,0,next);assert.throws(()=>compilePlan(grouped),/Stale narration/);
});
for(const [label,A,B,red,blue] of [
 ['trailing player whitespace','甲方','甲方 ','红牌','蓝牌'],
 ['empty strategies','甲方','乙方',' ','  '],
 ['control character','甲\u0000方','乙方','红牌','蓝牌'],
 ['multiline label','甲\n方','乙方','红牌','蓝牌'],
 ['zero-width label','甲方','甲\u200B方','红牌','蓝牌'],
 ['lone surrogate','甲\uD800方','乙方','红牌','蓝牌'],
 ['canonical equivalent names','é','e\u0301','红牌','蓝牌'],
 ['compatibility equivalent strategies','甲方','乙方','Ａ','A'],
 ['collapsed visible spaces','甲 方','甲  方','红牌','蓝牌'],
])test(`label contract rejects ${label}`,()=>{
 const plan=fixture();plan.caseData.players.A.name=A;plan.caseData.players.B.name=B;plan.caseData.strategies={red,blue};assert.throws(()=>compilePlan(plan),/label must|visible .* must differ/);
});
test('joint reveal requires complete owner choices agreeing with its semantic cell',()=>{
 for(const mutate of [e=>delete e.cell,e=>delete e.choices,e=>delete e.choices.A,e=>e.choices.A='blue',e=>e.choices.C='red',e=>e.cell='XY']){const plan=fixture();mutate(plan.blocks[0].events[0]);assert.throws(()=>compilePlan(plan));}
 for(const [cell,choices] of [['RR',{A:'red',B:'red'}],['RB',{A:'red',B:'blue'}],['BR',{A:'blue',B:'red'}],['BB',{A:'blue',B:'blue'}]]){
  const plan=fixture();Object.assign(plan.blocks[0].events[0],{cell,choices});const next=compilePlan(plan);
  assert.deepEqual(resolveFrame(next,40).information.choices,choices);assert.equal(resolveFrame(next,40).information.cell,cell);assert.equal(resolveFrame(next,50).information.choices,null);
 }
});

test('limited semantic narration schema rejects unbound raw prose and line-separator labels',()=>{
 for(const change of [p=>p.blocks[1].subtitles[0].narration={kind:'raw_text',text:'任意旧稿'},p=>delete p.blocks[1].subtitles[0].narration,p=>p.blocks[1].subtitles[0].narration={kind:'summary'},p=>p.caseData.players.A.name='甲\u2028方']){const plan=fixture();change(plan);assert.throws(()=>compilePlan(plan));}
 const plan=fixture();plan.blocks[0].voiceover='两个旧名字不对应新案例。';plan.blocks[0].subtitles[0].lines=[plan.blocks[0].voiceover];assert.throws(()=>compilePlan(plan),/Stale narration/);
});

test('glyph-bearing but invisible Unicode fillers cannot distinguish player or strategy labels',()=>{
 for(const point of [0x3164,0x115f,0x1160,0xffa0,0x034f,0x180b]){
  for(const kind of ['player','strategy']){
   const plan=fixture(),filler=String.fromCodePoint(point);
   if(kind==='player')plan.caseData.players.B.name=plan.caseData.players.A.name+filler;
   else plan.caseData.strategies.blue=plan.caseData.strategies.red+filler;
   rebuildNarration(plan);assert.throws(()=>compilePlan(plan),/default-ignorable/);
  }
 }
});
