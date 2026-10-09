import {ramp} from './motion.mjs';
import {windowClock} from './scene-window-timing.mjs';

/** Fit all four staggered entrances, a settled hold and the exit to the live
 * cue. The two-second budget leaves .25s after the last entrance before exit.
 * Roomy/default cues retain the original arithmetic and rendered appearance.
 */
export function fourQuestionsState(t,segment) {
 const {time,start,end}=windowClock(t,segment,2);
 const enter=ramp(time,start,.6),exit=ramp(time,end-.3,.25);
 return {enter,exit,alpha:enter*(1-exit),items:[0,1,2,3].map(i=>ramp(time,start+.35*i,.4))};
}
