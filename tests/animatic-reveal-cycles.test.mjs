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

test('a narrated joint reveal can stay visible into compatible later phases until its explicit conceal',()=>{
  const plan=fixture(),event=plan.blocks[0].events.pop(),block=plan.blocks[1];
  plan.blocks[0].events[0].cell='RR';plan.blocks[0].events[0].choices=choicesForCell('RR');
  event.phaseId=block.subtitles[1].id;event.frame=101;block.events.push(event);
  const compiled=compilePlan(plan);
  for(const frame of [40,59,60,79,80,100]){
    const state=resolveFrame(compiled,frame);
    assert.equal(state.information.phase,'visible');
    assert.deepEqual(state.information.choices,{A:'red',B:'red'});
  }
  for(const frame of [101,102,119])assert.equal(resolveFrame(compiled,frame).information.phase,'hidden');
  assert.deepEqual(resolveFrame(compiled,100).revealedScores.RR,[2,7]);
});

test('the original RB hold through RR narration is rejected even before its border activates',()=>{
  const plan=fixture(),conceal=plan.blocks[0].events.pop();
  conceal.phaseId='rr_result';conceal.frame=101;plan.blocks[1].events.push(conceal);
  assert.throws(()=>compilePlan(plan),/rr_choice: revealing\/visible cards contradict the current expected cell/);
});

for(const [name,cell,phaseIndex,revealFrame,phaseStart,concealPhase] of [
  ['case','RB',0,20,60,'rr_choice'],
  ['comparison','RB',2,181,200,'compare_red'],
])test(`incompatible ${name} narration accepts conceal at its start, but rejects one frame later`,()=>{
  for(const offset of [-1,0,1]){
    const plan=fixture();
    if(name==='comparison')plan.blocks[phaseIndex].events.push({id:'comparison_open',type:'joint_reveal',phaseId:'rb_result',frame:revealFrame,durationFrames:8,cell,choices:choicesForCell(cell)});
    const conceal=name==='case'?plan.blocks[0].events.pop():{id:'comparison_hide',type:'conceal_choices'};
    conceal.frame=phaseStart+offset;
    const owner=plan.blocks.find(block=>conceal.frame>=block.startFrame&&conceal.frame<block.endFrame);
    conceal.phaseId=owner.subtitles.find(phase=>conceal.frame>=phase.startFrame&&conceal.frame<phase.endFrame).id;
    owner.events.push(conceal);
    if(offset===1){assert.throws(()=>compilePlan(plan),new RegExp(`${concealPhase}: revealing/visible cards contradict`));continue;}
    const compiled=compilePlan(plan);
    assert.equal(resolveFrame(compiled,conceal.frame-1).information.cell,cell);
    assert.equal(resolveFrame(compiled,conceal.frame).information.phase,'hidden');
    const next=resolveFrame(compiled,phaseStart);assert.equal(next.activeCell,null);assert.equal(next.information.phase,'hidden');
  }
});

test('a compatible comparison hold ends precisely at the next incompatible comparison phrase',()=>{
  const plan=fixture(),block=plan.blocks[3];
  block.events.push(
    {id:'compare_open',type:'joint_reveal',phaseId:'compare_red',frame:201,durationFrames:8,cell:'RR',choices:choicesForCell('RR')},
    {id:'compare_hide',type:'conceal_choices',phaseId:'compare_blue',frame:240},
  );
  const compiled=compilePlan(plan);
  for(const frame of [201,208,209,219,220,239])assert.equal(resolveFrame(compiled,frame).information.cell,'RR');
  assert.equal(resolveFrame(compiled,240).information.phase,'hidden');
  block.events.at(-1).frame++;
  assert.throws(()=>compilePlan(plan),/compare_blue: revealing\/visible cards contradict/);
});

test('a no-focus summary may retain the previous choice cell until explicit conceal',()=>{
  const plan=fixture();
  plan.blocks[3].events.push({id:'summary_open',type:'joint_reveal',phaseId:'compare_blue',frame:261,durationFrames:8,cell:'RB',choices:choicesForCell('RB')});
  plan.blocks[4].events.push({id:'summary_hide',type:'conceal_choices',phaseId:'summary_caption',frame:331});
  const compiled=compilePlan(plan);
  for(const frame of [279,280,281,330])assert.equal(resolveFrame(compiled,frame).information.cell,'RB');
  assert.equal(resolveFrame(compiled,280).activeCell,null);
  assert.equal(resolveFrame(compiled,331).information.phase,'hidden');
});

test('a no-focus summary does not erase the card-cell contract for the next focused phrase',()=>{
  const plan=fixture(),conceal=plan.blocks[0].events.pop();
  plan.blocks=plan.blocks.slice(0,3);plan.durationFrames=200;
  for(const phase of plan.blocks[1].subtitles){phase.focus=structuredClone(plan.blocks[0].subtitles[0].focus);phase.narration={kind:'summary'};}
  plan.blocks[1].events=[];
  conceal.phaseId='rb_result';conceal.frame=171;plan.blocks[2].events.push(conceal);
  rebuildNarration(plan);const compiled=compilePlan(plan);
  for(const frame of [59,60,79,80,119,120,150,170])assert.equal(resolveFrame(compiled,frame).information.cell,'RB');
  assert.equal(resolveFrame(compiled,171).information.phase,'hidden');
  for(const phase of plan.blocks[2].subtitles)phase.focus.expectedCell='RR';
  for(const event of plan.blocks[2].events)if(event.cell)event.cell='RR';
  rebuildNarration(plan);
  assert.throws(()=>compilePlan(plan),/rb_choice: revealing\/visible cards contradict the current expected cell/);
});

test('fresh participants may start at reveal, but must conceal any previous cycle by their start',()=>{
  for(const [concealFrame,revealFrame,accepted] of [[279,280,true],[280,292,true],[281,292,false]]){
    const plan=fixture(),block=plan.blocks[4],phase=block.subtitles[0];phase.narration={kind:'participants'};
    plan.blocks[3].events.push({id:'prior_open',type:'joint_reveal',phaseId:'compare_blue',frame:261,durationFrames:8,cell:'RB',choices:choicesForCell('RB')});
    const previousConceal={id:'prior_hide',type:'conceal_choices',phaseId:concealFrame<280?'compare_blue':phase.id,frame:concealFrame};
    plan.blocks[concealFrame<280?3:4].events.push(previousConceal);
    block.events.push(
      {id:'fresh_open',type:'joint_reveal',phaseId:phase.id,frame:revealFrame,durationFrames:8,cell:'BR',choices:choicesForCell('BR')},
      {id:'fresh_hide',type:'conceal_choices',phaseId:phase.id,frame:331},
    );
    rebuildNarration(plan);
    if(!accepted){assert.throws(()=>compilePlan(plan),/participants narration must start without cards from a previous reveal/);continue;}
    const compiled=compilePlan(plan);
    assert.equal(resolveFrame(compiled,280).information.phase,revealFrame===280?'revealing':'hidden');
    assert.deepEqual(resolveFrame(compiled,revealFrame+8).information.choices,choicesForCell('BR'));
  }
});

for(const timingStatus of ['synthetic_test_only','manual_reference_not_audio_aligned'])test(`joint reveal must have a fully visible frame before its exclusive phase end (${timingStatus})`,()=>{
  const plan=fixture(),block=plan.blocks[0],phase=block.subtitles[0],reveal=block.events[0],conceal=block.events.pop();
  reveal.cell='RR';reveal.choices=choicesForCell('RR');
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
  assert.deepEqual(last.information.choices,{A:'red',B:'red'});
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
