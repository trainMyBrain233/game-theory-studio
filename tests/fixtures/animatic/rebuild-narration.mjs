// Explicit test/source build step. Compilation itself never rewrites stale text.
import {narrationForPhase} from '../../../production/src/animatic/semantic-state.mjs';
export function rebuildNarration(plan){
 for(const block of plan.blocks){
  for(const phase of block.subtitles)phase.lines=[narrationForPhase(plan.caseData,phase)];
  block.voiceover=block.subtitles.flatMap(phase=>phase.lines).join('');
 }
 return plan;
}
