/** Public two-player semantic core. Integer frames only; no Canvas, I/O or clock. */
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import schema from '../../../schemas/animatic-plan.schema.json' with {type:'json'};

const validate = new Ajv({allErrors:true,strict:true}).compile(schema);
const compiledPlans = new WeakSet();
export const CELLS = Object.freeze(['RR','RB','BR','BB']);
export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze); Object.freeze(value);
  }
  return value;
}
const compact = text => text.replace(/\s/gu,'');
const readableCount = text => [...text.matchAll(/[\p{L}\p{N}]/gu)].length;
const within = (frame, window) => frame >= window.startFrame && frame < window.endFrame;
function normalizedLabel(label,role) {
  assert(label.isWellFormed() && label.trim()===label && /[\p{L}\p{N}]/u.test(label) && !/[\p{C}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/u.test(label),`${role}: label must be trimmed, well-formed, visible and single-line without controls or default-ignorable characters`);
  return label.normalize('NFKC').replace(/\s+/gu,' ');
}
export function choicesForCell(cell) {
  assert(CELLS.includes(cell),'Unknown semantic cell');
  return {A:cell[0]==='R'?'red':'blue',B:cell[1]==='R'?'red':'blue'};
}
function spokenScore(value) {
  assert(Number.isInteger(value) && value>=0 && value<=99,'Narrated score must be integer 0..99');
  const digits='零一二三四五六七八九';
  return value<10?digits[value]:(value>=20?digits[Math.floor(value/10)]:'')+'十'+(value%10?digits[value%10]:'');
}
/** The deliberately limited v1.1 narration forms resolve only from the case. */
export function narrationForPhase(caseData,phase) {
  const {A,B}=caseData.players,kind=phase.narration.kind,cell=phase.focus.expectedCell;
  if(kind==='participants' || kind==='summary') {
    assert.equal(phase.focus.kind,'none',`${kind} narration requires a no-focus phase`);
    return kind==='participants'?`${A.name}和${B.name}各自选牌，一起亮牌。`:'收益取决于双方的选择组合。';
  }
  assert(CELLS.includes(cell),'Case narration requires an explicit semantic cell');
  const choices=choicesForCell(cell),values=caseData.values[cell];
  if(kind==='comparison') {
    assert.equal(phase.focus.kind,'comparison','Comparison narration requires a comparison phase');
    return `${B.name}选${caseData.strategies[choices.B]}，${A.name}得${spokenScore(values[0])}分${phase.narration.ending}`;
  }
  assert.equal(phase.focus.kind,'case','Choice/result narration requires a case phase');
  assert(['choices','payoffs'].includes(kind),'Unsupported narration kind');
  return kind==='choices'?`${A.name}选${caseData.strategies[choices.A]}，${B.name}选${caseData.strategies[choices.B]}。`:`${A.name}得${spokenScore(values[0])}分，${B.name}得${spokenScore(values[1])}分。`;
}
function unique(items, label) {
  assert.equal(new Set(items.map(item=>item.id)).size,items.length,`${label}: duplicate ID`);
}
export function compilePlan(input) {
  assert(validate(input),`Animatic schema: ${JSON.stringify(validate.errors)}`);
  const plan = structuredClone(input), phases = plan.blocks.flatMap(block=>block.subtitles);
  const events = plan.blocks.flatMap(block=>block.events).sort((a,b)=>a.frame-b.frame || a.id.localeCompare(b.id));
  unique(plan.blocks,'blocks'); unique(phases,'phases'); unique(events,'events');
  const byPhase = new Map(phases.map(phase=>[phase.id,phase]));
  const names = Object.values(plan.caseData.players).map(player=>player.name);
  assert.notEqual(...names.map((name,index)=>normalizedLabel(name,`Player ${index}`)),'Player visible names must differ');
  const strategies=Object.values(plan.caseData.strategies);
  assert.notEqual(...strategies.map((label,index)=>normalizedLabel(label,`Strategy ${index}`)),'Strategy visible labels must differ');
  let cursor = 0;
  for (const block of plan.blocks) {
    assert.equal(block.startFrame,cursor,'Blocks must continuously cover the frame range');
    assert(block.endFrame > block.startFrame,'Block must have a positive frame window');
    cursor = block.endFrame; let captionCursor = block.startFrame;
    for (const phase of block.subtitles) {
      assert.equal(phase.startFrame,captionCursor,'Subtitle windows must be continuous');
      assert(phase.endFrame > phase.startFrame && phase.endFrame <= block.endFrame,'Subtitle outside block');
      captionCursor = phase.endFrame;
      assert(phase.lines.every(line=>readableCount(line)<=22),'Subtitle line exceeds 22 readable characters');
      assert(phase.lines.every(line=>line.isWellFormed() && line.trim()===line && !/[\p{C}\p{Zl}\p{Zp}]/u.test(line)),'Subtitle lines must be explicit well-formed single lines without controls');
      assert.equal(phase.lines.join(''),narrationForPhase(plan.caseData,phase),`Stale narration for ${phase.id}: rebuild from semantic case references`);
      const focus = phase.focus;
      if (focus.kind==='none') {
        assert.equal(focus.expectedCell,null,'No-focus phase cannot expect a cell');
        assert.equal(focus.scope,null,'No-focus phase cannot inherit a scope');
        assert.equal(focus.rowChoice,null,'No-focus phase cannot retain a row');
      } else {
        assert(CELLS.includes(focus.expectedCell),'Focused phase requires an explicit expected cell');
        const scope = byPhase.get(focus.scope);
        assert(scope && scope.startFrame <= phase.startFrame,'Unknown or future focus scope');
        assert.equal(scope.focus.scope,scope.id,'Focus scope must name its original phase');
        assert.equal(scope.focus.expectedCell,focus.expectedCell,'Cannot carry a different case into a phase');
        if (focus.kind==='comparison') {
          assert.equal(focus.scope,phase.id,'Each comparison phrase must reset its focus');
          assert.equal(focus.rowChoice,focus.expectedCell[0]==='R'?'red':'blue','Comparison row contradicts cell');
        } else {
          assert.equal(focus.rowChoice,null,'Case phases do not implicitly focus a row');
          const span=phases.slice(phases.indexOf(scope),phases.indexOf(phase)+1);
          assert(span.every(item=>item.focus.kind==='case' && item.focus.expectedCell===focus.expectedCell && item.focus.scope===focus.scope),'Case scope cannot resume after an unrelated phrase');
        }
      }
    }
    assert.equal(captionCursor,block.endFrame,'Subtitles must include the entire tail window');
    const lines = block.subtitles.flatMap(phase=>phase.lines);
    assert.equal(lines.join(''),block.voiceover,'Complete subtitle groups must preserve the exact voiceover');
    assert.equal(block.voiceover,block.subtitles.map(phase=>narrationForPhase(plan.caseData,phase)).join(''),'Voiceover must match semantic case references');
    // Any original name/number-unit token must remain on one line and in one group.
    for (const token of [...names,...strategies,...(block.voiceover.match(/(?:[0-9]+(?:[.][0-9]+)?(?:分|轮|秒|次|个)?|[零一二三四五六七八九十百千万]+(?:分|轮|秒|次|个))/gu)||[])]) {
      const occurrences = text => compact(text).split(compact(token)).length-1;
      assert.equal(lines.reduce((sum,line)=>sum+occurrences(line),0),occurrences(block.voiceover),`Subtitle splits protected token ${token}`);
    }
    for (const event of block.events) {
      const phase = byPhase.get(event.phaseId);
      assert(within(event.frame,block),'Event outside its block');
      assert(phase && block.subtitles.includes(phase) && within(event.frame,phase),'Event outside its referenced phase');
      if (event.type==='joint_reveal') {
        assert(event.frame+event.durationFrames < phase.endFrame,'Reveal completion must be an in-range visible frame');
        assert.deepEqual(event.choices,choicesForCell(event.cell),'Joint reveal owner choices contradict its semantic cell');
        if(phase.focus.expectedCell!==null)assert.equal(event.cell,phase.focus.expectedCell,'Joint reveal cell contradicts its current focus');
      }
      if (event.type==='focus_cell') {
        assert.notEqual(phase.focus.kind,'none','A no-focus phase cannot activate a cell');
        assert.equal(phase.focus.scope,phase.id,'Focus event must belong to the current phase');
        assert.equal(event.cell,phase.focus.expectedCell,'Focus event contradicts the current expected cell');
      }
      if (event.type==='reveal_score') assert.equal(event.cell,phase.focus.expectedCell,'Score event must match its current case');
    }
  }
  assert.equal(cursor,plan.durationFrames,'Blocks must cover the exact duration');
  for (const cell of CELLS) {
    const owners=events.filter(event=>event.type==='reveal_score' && event.cell===cell).map(event=>event.owner).sort();
    if(owners.length) assert.deepEqual(owners,['A','B'],`${cell}: a revealed pair requires exactly one event per owner`);
  }
  for(const phase of phases) assert(events.filter(event=>event.phaseId===phase.id && event.type==='focus_cell').length<=1,'Only one focus activation per phase');
  const cardEvents=events.filter(event=>['joint_reveal','conceal_choices'].includes(event.type));
  for(let i=1;i<cardEvents.length;i++) {
    const previous=cardEvents[i-1];
    assert(cardEvents[i].frame>previous.frame+(previous.durationFrames||0),'Card phases cannot overlap or conflict on a frame');
  }
  const compiled=deepFreeze({plan,phases,events});compiledPlans.add(compiled);return compiled;
}

export function resolveFrame(compiled,frame) {
  assert(compiledPlans.has(compiled),'Use compilePlan before resolving frames');
  assert(Number.isSafeInteger(frame) && frame>=0 && frame<compiled.plan.durationFrames,'Frame must be a safe integer within [0, durationFrames)');
  const block=compiled.plan.blocks.find(block=>within(frame,block));
  const caption=block.subtitles.find(phase=>within(frame,phase));
  const events=compiled.events.filter(event=>event.frame<=frame);
  const revealedScores=Object.fromEntries(CELLS.map(cell=>[cell,[null,null]]));
  for(const event of events) if(event.type==='reveal_score') {
    const index=compiled.plan.caseData.players[event.owner].payoffIndex;
    revealedScores[event.cell][index]=compiled.plan.caseData.values[event.cell][index];
  }
  const focus=caption.focus;
  const activeCell=focus.kind!=='none' && events.some(event=>event.type==='focus_cell' && event.phaseId===focus.scope && event.cell===focus.expectedCell) ? focus.expectedCell : null;
  const cardEvent=events.filter(event=>['joint_reveal','conceal_choices'].includes(event.type)).at(-1);
  const revealProgress=cardEvent?.type==='joint_reveal'?Math.min(1,(frame-cardEvent.frame)/cardEvent.durationFrames):0;
  const informationPhase=cardEvent?.type!=='joint_reveal'?'hidden':revealProgress<1?'revealing':'visible';
  return deepFreeze({frame,blockId:block.id,phaseId:caption.id,caption,events,revealedScores,activeCell,rowFocus:focus.rowChoice,
    information:{phase:informationPhase,revealProgress,choicesVisible:informationPhase==='visible',cell:cardEvent?.type==='joint_reveal'?cardEvent.cell:null,choices:cardEvent?.type==='joint_reveal'?cardEvent.choices:null},
    timingStatus:compiled.plan.timingStatus,audioTiming:null});
}
