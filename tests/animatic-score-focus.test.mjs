import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compilePlan,resolveFrame} from '../production/src/animatic/semantic-state.mjs';
import {rebuildNarration} from './fixtures/animatic/rebuild-narration.mjs';

const fixture=()=>JSON.parse(fs.readFileSync(new URL('./fixtures/animatic/minimal-plan.json',import.meta.url),'utf8'));
const orderError=/score reveal must not precede focus activation in scope rr_result/;
function freshResultScope(focusFrame) {
  const plan=fixture(),block=plan.blocks[1],phase=block.subtitles[1];
  phase.focus.scope=phase.id;
  // Keep the earlier RR choice activation: it cannot satisfy this new scope.
  block.events.push({id:'result_focus',frame:focusFrame,phaseId:phase.id,type:'focus_cell',cell:'RR'});
  return plan;
}

for(const frame of [91,100,101,110])test(`each score reveal requires its own scope's focus by frame ${frame}`,()=>{
  const plan=freshResultScope(frame);
  assert.throws(()=>compilePlan(plan),orderError);
});

test('focus earlier in the payoff scope preserves staggered owner reveals at exact boundaries',()=>{
  const compiled=compilePlan(freshResultScope(85));
  for(const [frame,cell,scores] of [[79,'RR',[null,null]],[80,null,[null,null]],[84,null,[null,null]],[85,'RR',[null,null]],[89,'RR',[null,null]],[90,'RR',[2,null]],[99,'RR',[2,null]],[100,'RR',[2,7]]]) {
    const state=resolveFrame(compiled,frame);
    assert.equal(state.activeCell,cell);assert.deepEqual(state.revealedScores.RR,scores);
  }
});

test('same-frame focus and reveals accept either owner order and either event-ID sort order',()=>{
  for(const focusId of ['a_focus','z_focus'])for(const reverse of [false,true]) {
    const plan=freshResultScope(90),block=plan.blocks[1];
    block.events.at(-1).id=focusId;
    for(const event of block.events.filter(event=>event.type==='reveal_score'))event.frame=90;
    const canonical=compilePlan(plan);
    if(reverse)block.events.reverse();
    const reordered=compilePlan(plan);
    for(const frame of [91,90,89,90,91]) {
      const state=resolveFrame(reordered,frame);
      assert.deepEqual(state,resolveFrame(canonical,frame));
      assert.equal(state.activeCell,frame<90?null:'RR');
      assert.deepEqual(state.revealedScores.RR,frame<90?[null,null]:[2,7]);
    }
  }
});

test('shared choice scope may focus earlier and later cycles may reuse the already revealed pair',()=>{
  const plan=fixture(),block=plan.blocks.at(-1),phase=block.subtitles[0];
  phase.narration={kind:'payoffs'};
  phase.focus={kind:'case',expectedCell:'RR',scope:phase.id,rowChoice:null};
  block.events=[{id:'repeat_focus',frame:300,phaseId:phase.id,type:'focus_cell',cell:'RR'}];
  rebuildNarration(plan);const compiled=compilePlan(plan);
  for(const [frame,cell,scores] of [[70,'RR',[null,null]],[90,'RR',[2,null]],[100,'RR',[2,7]],[280,null,[2,7]],[299,null,[2,7]],[300,'RR',[2,7]]]) {
    const state=resolveFrame(compiled,frame);
    assert.equal(state.activeCell,cell);assert.deepEqual(state.revealedScores.RR,scores);
  }
});

test('new payoff scope ordering is independent of phase IDs, frame scale and timing mode',()=>{
  const plan=freshResultScope(90);plan.timingStatus='manual_reference_not_audio_aligned';
  const ids=new Map(plan.blocks.flatMap(block=>block.subtitles).map((phase,index)=>[phase.id,`phase_${index}`]));
  plan.durationFrames*=3;
  for(const block of plan.blocks) {
    block.startFrame*=3;block.endFrame*=3;
    for(const phase of block.subtitles) {
      phase.id=ids.get(phase.id);phase.startFrame*=3;phase.endFrame*=3;
      if(phase.focus.scope!==null)phase.focus.scope=ids.get(phase.focus.scope);
    }
    for(const event of block.events) {
      event.phaseId=ids.get(event.phaseId);event.frame*=3;
      if(event.durationFrames)event.durationFrames*=3;
    }
    block.events.reverse();
  }
  const compiled=compilePlan(plan);
  assert.equal(resolveFrame(compiled,269).activeCell,null);
  assert.equal(resolveFrame(compiled,270).activeCell,'RR');
  assert.deepEqual(resolveFrame(compiled,270).revealedScores.RR,[2,null]);
  plan.blocks[1].events.find(event=>event.id==='result_focus').frame++;
  assert.throws(()=>compilePlan(plan),/score reveal must not precede focus activation in scope phase_2/);
});
