import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compilePlan,resolveFrame,choicesForCell} from '../production/src/animatic/semantic-state.mjs';
import {rebuildNarration} from './fixtures/animatic/rebuild-narration.mjs';

const fixture=()=>JSON.parse(fs.readFileSync(new URL('./fixtures/animatic/minimal-plan.json',import.meta.url),'utf8'));
const isCardEvent=event=>['joint_reveal','conceal_choices'].includes(event.type);
const promisedCycle=/participants narration requires exactly one joint reveal in its window/;

for(const [label,mutate] of [
  ['both events omitted',plan=>plan.blocks[0].events=[]],
  ['reveal omitted',plan=>plan.blocks[0].events.shift()],
  ['duplicate reveal',plan=>plan.blocks[0].events.unshift({...plan.blocks[0].events[0],id:'open_early',frame:1,durationFrames:1})],
  ['whole cycle moved to an unrelated phase',plan=>{
    const block=plan.blocks.at(-1);block.events=plan.blocks[0].events.splice(0);
    for(const event of block.events){event.phaseId=block.subtitles[0].id;event.frame+=block.startFrame;}
  }],
])test(`promised card cycle rejects ${label}`,()=>{
  const plan=fixture();mutate(plan);assert.throws(()=>compilePlan(plan),promisedCycle);
});

for(const [label,mutate,expected] of [
  ['conceal omitted',plan=>plan.blocks[0].events.pop(),/Every joint reveal requires a following conceal/],
  ['conceal before reveal',plan=>plan.blocks[0].events[1].frame=1,/Conceal requires a preceding joint reveal/],
  ['duplicate conceal',plan=>plan.blocks[0].events.push({...plan.blocks[0].events[1],id:'hide_again',frame:55}),/Conceal requires a preceding joint reveal/],
])test(`promised card cycle also rejects ${label}`,()=>{
  const plan=fixture();mutate(plan);assert.throws(()=>compilePlan(plan),expected);
});

for(const [label,mutate,expected] of [
  ['conceal only',block=>block.events.shift(),/Conceal requires a preceding joint reveal/],
  ['reveal only',block=>block.events.pop(),/Every joint reveal requires a following conceal/],
  ['conceal before reveal',block=>block.events[1].frame=1,/Conceal requires a preceding joint reveal/],
  ['two reveals',block=>block.events.unshift({...block.events[0],id:'open_early',frame:1,durationFrames:1}),/Joint reveal requires hidden cards/],
  ['two conceals',block=>block.events.push({...block.events[1],id:'hide_again',frame:55}),/Conceal requires a preceding joint reveal/],
  ['conceal during the reveal',block=>block.events[1].frame=30,/Card phases cannot overlap/],
  ['conceal at reveal completion',block=>block.events[1].frame=40,/Card phases cannot overlap/],
  ['conceal on the reveal frame',block=>block.events[1].frame=20,/Card phases cannot overlap|Conceal requires a preceding joint reveal/],
])test(`optional card cycle state machine rejects ${label}`,()=>{
  const plan=fixture();plan.blocks[0].subtitles[0].narration={kind:'summary'};rebuildNarration(plan);
  // No promised participants cycle here: failures must come from the state machine.
  mutate(plan.blocks[0]);assert.throws(()=>compilePlan(plan),expected);
});

test('non-reveal narration accepts no card events while retaining choice/payoff/comparison state',()=>{
  const plan=fixture();plan.blocks[0].subtitles[0].narration={kind:'summary'};
  for(const block of plan.blocks)block.events=block.events.filter(event=>!isCardEvent(event));
  rebuildNarration(plan);const compiled=compilePlan(plan);
  for(let frame=0;frame<plan.durationFrames;frame++)assert.deepEqual(resolveFrame(compiled,frame).information,{phase:'hidden',revealProgress:0,choicesVisible:false,cell:null,choices:null});
  assert.equal(resolveFrame(compiled,70).activeCell,'RR');
  assert.deepEqual(resolveFrame(compiled,100).revealedScores.RR,[2,7]);
  assert.equal(resolveFrame(compiled,220).rowFocus,'red');
});

test('each participants phase independently requires its own complete cycle',()=>{
  const plan=fixture(),block=plan.blocks.at(-1),phase=block.subtitles[0];
  phase.narration={kind:'participants'};
  block.events=[
    {id:'second_open',frame:292,phaseId:phase.id,type:'joint_reveal',durationFrames:8,cell:'BR',choices:choicesForCell('BR')},
    {id:'second_hide',frame:331,phaseId:phase.id,type:'conceal_choices'},
  ];
  rebuildNarration(plan);const compiled=compilePlan(plan);
  for(const [frame,expected] of [[291,'hidden'],[292,'revealing'],[294,'revealing'],[296,'revealing'],[298,'revealing'],[300,'visible'],[330,'visible'],[331,'hidden'],[332,'hidden']])assert.equal(resolveFrame(compiled,frame).information.phase,expected);
  for(const index of [0,4]){
    const missing=structuredClone(plan);missing.blocks[index].events=[];
    assert.throws(()=>compilePlan(missing),promisedCycle,'A complete cycle in another phase cannot satisfy this promise');
  }
});

test('a narrated joint reveal can stay visible into later phases until its explicit conceal',()=>{
  const plan=fixture(),event=plan.blocks[0].events.pop(),block=plan.blocks[1];
  event.phaseId=block.subtitles[1].id;event.frame=101;block.events.push(event);
  const compiled=compilePlan(plan);
  for(const frame of [40,59,60,79,80,100]){
    const state=resolveFrame(compiled,frame);
    assert.equal(state.information.phase,'visible');
    assert.deepEqual(state.information.choices,{A:'red',B:'blue'});
  }
  for(const frame of [101,102,119])assert.equal(resolveFrame(compiled,frame).information.phase,'hidden');
  assert.deepEqual(resolveFrame(compiled,100).revealedScores.RR,[2,7]);
});

for(const timingStatus of ['synthetic_test_only','manual_reference_not_audio_aligned'])test(`joint reveal must have a fully visible frame before its exclusive phase end (${timingStatus})`,()=>{
  const plan=fixture(),block=plan.blocks[0],phase=block.subtitles[0],reveal=block.events[0],conceal=block.events.pop();
  plan.timingStatus=timingStatus;
  reveal.durationFrames=phase.endFrame-1-reveal.frame;
  // Conceal in the next phase, after both tested completion times. Only the
  // reveal's half-open narration window distinguishes the accepted/rejected pair.
  conceal.phaseId=plan.blocks[1].subtitles[0].id;conceal.frame=phase.endFrame+1;plan.blocks[1].events.push(conceal);
  const compiled=compilePlan(plan);
  assert.equal(resolveFrame(compiled,phase.endFrame-2).information.phase,'revealing');
  const last=resolveFrame(compiled,phase.endFrame-1);
  assert.equal(last.phaseId,phase.id);assert.equal(last.information.phase,'visible');
  assert.equal(last.information.revealProgress,1);assert.equal(last.information.choicesVisible,true);
  assert.deepEqual(last.information.choices,{A:'red',B:'blue'});
  assert.equal(resolveFrame(compiled,phase.endFrame).information.phase,'visible');
  assert.equal(resolveFrame(compiled,phase.endFrame+1).information.phase,'hidden');
  const missingVisibleFrame=structuredClone(plan);missingVisibleFrame.blocks[0].events[0].durationFrames++;
  assert.throws(()=>compilePlan(missingVisibleFrame),/Reveal completion must be an in-range visible frame/);
});

test('same-frame card controls fail independently of input array order or event IDs',()=>{
  for(const [revealId,concealId] of [['a_reveal','z_hide'],['z_reveal','a_hide']])for(const reverse of [false,true]){
    const plan=fixture(),[reveal,conceal]=plan.blocks[0].events;
    reveal.id=revealId;conceal.id=concealId;conceal.frame=reveal.frame;
    if(reverse)plan.blocks[0].events.reverse();
    assert.throws(()=>compilePlan(plan),/Card phases cannot overlap|Conceal requires a preceding joint reveal/);
  }
});

test('card cycle is phase-bound rather than fixture-ID/frame-bound, for both supported timing modes',()=>{
  for(const timingStatus of ['synthetic_test_only','manual_reference_not_audio_aligned']){
    const plan=fixture();plan.timingStatus=timingStatus;plan.durationFrames*=3;
    const ids=new Map(plan.blocks.flatMap(block=>block.subtitles).map((phase,index)=>[phase.id,`renamed_phase_${index}`]));
    for(const block of plan.blocks){
      block.startFrame*=3;block.endFrame*=3;
      for(const phase of block.subtitles){phase.id=ids.get(phase.id);phase.startFrame*=3;phase.endFrame*=3;if(phase.focus.scope!==null)phase.focus.scope=ids.get(phase.focus.scope);}
      for(const event of block.events){event.phaseId=ids.get(event.phaseId);event.frame*=3;if(event.durationFrames)event.durationFrames*=3;}
      block.events.reverse();
    }
    const compiled=compilePlan(plan);
    const frames=[59,60,75,90,105,119,120,121,149,150,151,179,180,181];
    const expected=new Map(frames.map(frame=>[frame,resolveFrame(compiled,frame)]));
    for(const frame of [...frames].reverse().concat(frames)){
      const state=resolveFrame(compiled,frame),info=state.information;
      assert.deepEqual(state,expected.get(frame));
      assert.equal(info.phase,frame<60||frame>=150?'hidden':frame<120?'revealing':'visible');
      assert.equal(info.revealProgress,frame<60||frame>=150?0:Math.min(1,(frame-60)/60));
      assert.equal(info.choicesVisible,frame>=120&&frame<150);
      assert.deepEqual(info.choices,frame>=60&&frame<150?{A:'red',B:'blue'}:null);
      assert.equal(state.timingStatus,timingStatus);assert.equal(state.audioTiming,null);
    }
    const missing=structuredClone(plan);missing.blocks[0].events=[];assert.throws(()=>compilePlan(missing),promisedCycle);
    const pretendingAudio=structuredClone(plan);pretendingAudio.audioTiming={aligned:true};assert.throws(()=>compilePlan(pretendingAudio),/Animatic schema/);
  }
});

test('complete optional focused cycles preserve owner choices and may hold across a shared case scope',()=>{
  for(const cell of ['RR','RB','BR','BB']){
    const plan=fixture(),block=plan.blocks[1],choice=block.subtitles[0],result=block.subtitles[1];
    choice.focus.expectedCell=cell;result.focus.expectedCell=cell;
    for(const event of block.events)event.cell=cell;
    // Comparisons reuse the original RR pair, so use the two case blocks alone.
    plan.blocks=plan.blocks.slice(0,2);plan.durationFrames=block.endFrame;
    block.events.push(
      {id:'case_open',frame:61,phaseId:choice.id,type:'joint_reveal',durationFrames:8,cell,choices:choicesForCell(cell)},
      {id:'case_hide',frame:119,phaseId:result.id,type:'conceal_choices'},
    );
    rebuildNarration(plan);const compiled=compilePlan(plan);
    for(const frame of [69,79,80,118])assert.deepEqual(resolveFrame(compiled,frame).information.choices,choicesForCell(cell));
    assert.equal(resolveFrame(compiled,119).information.phase,'hidden');
  }
});
