/** Keep the comparison insert inside its live narration windows. Long/default
 * windows retain the historical seconds; short windows compress all sibling
 * phases together, leaving a settled hold before the following subtitle.
 * Normalized short-window arithmetic avoids rounded-to-zero phase durations.
 */
import {ramp} from './motion.mjs';
function phase(t,segment,budget,offset,duration) {
 const {start,end}=segment,window=end-start;
 if(t<=start)return 0;
 if(t>=end)return 1;
 if(window>=budget)return ramp(t,start+offset,duration);
 return ramp((t-start)/window*budget,offset,duration);
}
export function comparisonState(t,timeline) {
 const segment=id=>timeline.segments.find(s=>s.id===id);
 const intro=segment('s16_comparison_intro'),example=segment('s17_comparison_example'),back=segment('s18_return_single_round');
 const enter=(offset,duration)=>phase(t,intro,1.65,offset,duration);
 const plan=(offset,duration)=>phase(t,example,4,offset,duration);
 const leave=(offset,duration)=>phase(t,back,4.8,offset,duration);
 return {
  multi:enter(0,1.05),comparisonAlpha:enter(1.05,.4)*(1-leave(2.05,.35)),
  hidden:enter(0,.55)*(1-plan(0,.6)),
  first:plan(0,.55),plan:plan(1.55,.7),red:plan(2.2,.55),blue:plan(3,.55),
  back:leave(2.5,1.1),names:leave(3.55,.25),single:leave(3.4,.4),
  singleExit:phase(t,back,4.8,Math.max(back.end-back.start,4.8)-.3,.25),
 };
}
