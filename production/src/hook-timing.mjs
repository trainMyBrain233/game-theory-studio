import {ramp} from './motion.mjs';
import {windowClock} from './scene-window-timing.mjs';

// The last arrow settles at 3.05; the 3.6-second budget reserves a visible
// joint hold before the parent starts clearing at 3.28. Every hook phase,
// including its actors and question, uses this clock rather than wall seconds.
export const hookBudget=3.6;
export const hookPhases=Object.freeze([
 ['actors',.4,.75],['names',1.6,0],['reveal',1.4,.55],
 ['arrowA',2,.7],['arrowB',2.35,.7],
]);
export const hookExit=Object.freeze({beforeEnd:.32,duration:.27});
export function hookState(t,segment) {
 const {time,start,end}=windowClock(t,segment,hookBudget),state={};
 for(const [name,offset,duration] of hookPhases)state[name]=duration?ramp(time,start+offset,duration):time>start+offset;
 const exit=ramp(time,end-hookExit.beforeEnd,hookExit.duration);
 return {...state,exit,alpha:1-exit,questionAlpha:state.reveal*(1-exit)};
}
