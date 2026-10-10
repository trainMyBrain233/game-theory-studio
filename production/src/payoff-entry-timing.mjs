import {ramp} from './motion.mjs';
import {windowClock} from './scene-window-timing.mjs';
/** Migrate identities and cards before introducing the grid and row labels. */
export function payoffEntryState(t,timeline) {
 const segment=id=>timeline.segments.find(s=>s.id===id);
 const row=segment('s21_rows'),prior=segment('s20_definition');
 const r=windowClock(t,row,2.5),c=windowClock(t,segment('s22_columns'),1.1);
 const previous=windowClock(t,prior,.5);
 const oldExit=1-ramp(previous.time,prior.end-prior.start<.5?previous.end-.45:row.start-.45,.42);
 return {move:ramp(r.time,r.start+.1,1.2),rows:ramp(r.time,r.start+1.5,.45),
  names:ramp(r.time,r.start+1.35,.3),grid:ramp(r.time,r.start+1.5,.7),
  showExplanation:r.time>=r.start+1.5,cols:ramp(c.time,c.start,.65),explanation:1-ramp(c.time,c.end-.3,.25),oldExit};
}
