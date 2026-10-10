import {ramp} from './motion.mjs';
import {windowClock} from './scene-window-timing.mjs';
/** Keep the three non-money examples, their reading hold and exit together. */
export function beyondMoneyState(t,timeline) {
 const segment=timeline.segments.find(s=>s.id==='s33_beyond_money');
 const clock=windowClock(t,segment,4.5),{time,start,end}=clock;
 const entrance=ramp(time,start,.6);
 return {entrance,alpha:entrance*(1-ramp(time,end-.3,.25)),
  examples:[0,1,2].map(i=>ramp(time,start+1.1+i*1.15,.4))};
}
/** Layout is ready before the first pair; each pair finishes in its own window. */
export function recapState(t,timeline) {
 const segment=id=>timeline.segments.find(s=>s.id===id);
 const layout=windowClock(t,segment('s34_intro'),1.95);
 const pairs=['s35_first_pair','s36_second_pair'].map(id=>windowClock(t,segment(id),2.2));
 return {move:ramp(layout.time,layout.start,1.15),rows:ramp(layout.time,layout.start+1.1,.55),
  active:pairs.flatMap(({time,start})=>[0,1].map(i=>ramp(time,start+i*1.4,.45)))};
}
