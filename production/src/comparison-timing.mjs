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
// One phase contract drives rendering and QA sampling, including the late
// branches that are more than two seconds after their subtitle boundary.
export const comparisonPhases=Object.freeze({
 's16_comparison_intro':{budget:1.65,phases:[['multi',0,1.05],['alpha',1.05,.4],['hidden',0,.55]]},
 's17_comparison_example':{budget:4,phases:[['unhide',0,.6],['first',0,.55],['plan',1.55,.7],['red',2.2,.55],['blue',3,.55]]},
 's18_return_single_round':{budget:4.8,phases:[['comparisonExit',2.05,.35],['back',2.5,1.1],['names',3.55,.25],['single',3.4,.4]]},
});
export function comparisonState(t,timeline) {
 const values={};
 for(const [id,{budget,phases}] of Object.entries(comparisonPhases)){
  const segment=timeline.segments.find(s=>s.id===id);
  for(const [name,offset,duration] of phases)values[name]=phase(t,segment,budget,offset,duration);
 }
 const back=timeline.segments.find(s=>s.id==='s18_return_single_round');
 return {
  multi:values.multi,comparisonAlpha:values.alpha*(1-values.comparisonExit),
  hidden:values.hidden*(1-values.unhide),
  first:values.first,plan:values.plan,red:values.red,blue:values.blue,
  back:values.back,names:values.names,single:values.single,
  singleExit:phase(t,back,4.8,Math.max(back.end-back.start,4.8)-.3,.25),
 };
}
