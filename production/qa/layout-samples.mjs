import {hookBudget,hookPhases,hookExit} from '../src/hook-timing.mjs';
import {comparisonPhases} from '../src/comparison-timing.mjs';
import {beforeEnd} from '../src/frame-time.mjs';

/** Actual motion windows in the episode's live timeline. Budgets mirror the
 * local clocks in the scene timing helpers; roomy cues keep absolute offsets.
 * Dense coverage also spans every whole segment, so a newly added late phase
 * cannot disappear from clearance QA merely because it is absent here.
 */
export function transitionIntervals(timeline) {
 const intervals=[];
 if(!timeline.segments.length)return intervals;
 const segment=id=>timeline.segments.find(s=>s.id===id);
 // Zero-duration phases are discrete switches: still sample their adjacent frames.
 const add=(id,start,end)=>{if(end>=start)intervals.push({id,start,end});};
 const phase=(s,budget,name,offset,duration)=>{
  const scale=Math.min(1,(s.end-s.start)/budget);
  add(`${s.id}:${name}`,s.start+offset*scale,s.start+(offset+duration)*scale);
 };
 const phases=(id,budget,specs)=>{const s=segment(id);for(const [name,offset,duration] of specs)phase(s,budget,name,offset,duration);};
 const exit=(id,budget,name='exit')=>{const s=segment(id);phase(s,budget,name,Math.max(budget,s.end-s.start)-.3,.25);};
 for(const s of timeline.segments)add(`${s.id}:subtitle`,s.start,Math.min(s.end,s.start+.09));
 for(const s of timeline.sections){add(`${s.id}:heading`,s.start+(s.id==='intro'?0:.06),s.start+(s.id==='intro'?.55:.48));if(s.id!=='recap')add(`${s.id}:heading-exit`,s.end-.3,s.end-.05);}
 phases('s01_hook',hookBudget,hookPhases);
 const hook=segment('s01_hook');phase(hook,hookBudget,'exit',Math.max(hookBudget,hook.end-hook.start)-hookExit.beforeEnd,hookExit.duration);
 phases('s02_four_questions',2,[['enter',0,.6],...[0,1,2,3].map(i=>[`item-${i}`,i*.35,.4])]);exit('s02_four_questions',2);
 phases('s08_known_unknown',4.8,[['rules',0,.55],['pick',1.25,.5],['unused',1.65,.6],['move',1.75,1.3],['hide',2.35,.85],['observation',2.6,.65],['grip-release',3.9,.65],['lift',1.6,2.4]]);
 phases('s09_simultaneous',4.1,[['grip',1.15,.45],['observation-exit',1.35,.3],['reveal',1.7,.9],['grip-release',3.15,.65],['lift',1.3,2.1]]);exit('s09_simultaneous',4.1,'explanation-exit');
 for(const [id,{budget,phases:specs}] of Object.entries(comparisonPhases))phases(id,budget,specs);
 exit('s18_return_single_round',4.8,'single-exit');
 phases('s20_definition',.5,[['old-exit',Math.max(.5,segment('s20_definition').end-segment('s20_definition').start)-.45,.42]]);
 phases('s21_rows',2.5,[['move',.1,1.2],['rows',1.5,.45],['names',1.35,.3],['grid',1.5,.7]]);
 phases('s22_columns',1.1,[['columns',0,.65]]);exit('s22_columns',1.1,'explanation-exit');
 phases('s33_beyond_money',4.5,[['entrance',0,.6],...[0,1,2].map(i=>[`example-${i}`,1.1+i*1.15,.4])]);exit('s33_beyond_money',4.5);
 phases('s34_intro',1.95,[['move',0,1.15],['rows',1.1,.55]]);
 for(const id of ['s35_first_pair','s36_second_pair'])phases(id,2.2,[['first',0,.45],['second',1.4,.45]]);
 for(const s of timeline.segments){
  if(s.visual_cue.action==='highlight_choices'){
   const scores=timeline.segments.find(x=>x.visual_cue.action==='reveal_scores'&&x.visual_cue.matrix_cell===s.visual_cue.matrix_cell);
   const cue={...s,end:Math.min(s.end,scores?.start??s.end)};
   for(const [name,offset,duration] of [['row',0,.45],['column',1.65,.45],['fill',1.7,.55],['border',1.7,.5],['label-A',0,.55],['label-B',1.6,.55]])phase(cue,2.25,name,offset,duration);
  }
  if(s.visual_cue.action==='reveal_scores'){
   for(const r of s.visual_cue.score_reveals)add(`${s.id}:score-${r.player}`,s.start+r.offset,s.start+r.offset+.38);
   const last=s.start+Math.max(...s.visual_cue.score_reveals.map(r=>r.offset));add(`${s.id}:score-explanation`,last,last+.55);
  }
 }
 // Uncompressed scene-local ramps/reveals, expressed against live cues.
 const fixed=(id,name,offset,duration)=>{const s=segment(id);add(`${id}:${name}`,s.start+offset,s.start+offset+duration);};
 for(const [id,name,offset,duration] of [
  ['s05_goal','prior-exit',-.3,.25],['s05_goal','goal',0,.6],['s06_definition','definition',0,.6],
  ['s10_distinction','distinction',0,.5],['s11_timing','summary',0,.55],['s11_timing','prior-exit',-.3,.25],
  ['s13_options','options',0,.55],['s14_simple_case','simple',0,.55],['s15_definition','definition',0,.55],['s15_definition','prior-exit',-.35,.3],
  ['s16_comparison_intro','names-exit',-.3,.25],['s16_comparison_intro','base-exit',-.45,.3],['s19_question','question',0,.55],['s20_definition','definition',0,.55],
  ['s23_score_order','order',0,.5],['s23_score_order','order-label',0,.55],['s32_joint_choices','summary',0,.5],['s33_beyond_money','prior-exit',-.3,.25],['s37_closing','closing',0,.55],
 ])fixed(id,name,offset,duration);
 for(const [id,cue] of [['players','s06_definition'],['information','s11_timing']]){
  fixed(cue,'definition-label',0,.5);const s=timeline.sections.find(s=>s.id===id);add(`${id}:body-exit`,s.end-.3,s.end-.05);
 }
 const strategy=timeline.sections.find(s=>s.id==='strategy');
 add('strategy:spread',strategy.start,strategy.start+.9);
 return intervals;
}

/** No decimal rounding: sub-frame and one-ULP windows retain their identity. */
export function createLayoutSamples(timeline,{fps=30,maxStep=.1,allFrames=false}={}) {
 if(!Number.isFinite(fps)||fps<=0||!Number.isFinite(maxStep)||maxStep<=0)throw Error('Sampling rates must be finite and positive.');
 const duration=timeline.duration,intervals=transitionIntervals(timeline),times=new Set();
 const put=t=>{if(t>=0&&t<duration)times.add(t);else if(t===duration)times.add(beforeEnd(duration));};
 const cover=(start,end,dense=false)=>{
  start=Math.max(0,start);end=Math.min(duration,end);if(end<start)return;
  const count=Math.max(1,Math.ceil((end-start)/maxStep));
  if(dense)for(let i=0;i<=count;i++)put(start+(end-start)*i/count);
  for(const fraction of [0,.25,.5,.75,1]){const t=start+(end-start)*fraction;put(t);put(t-1/fps);put(t+1/fps);}
  if(end>0)put(beforeEnd(end));
 };
 cover(0,duration,true);
 for(const s of timeline.segments)cover(s.start,s.end);
 for(const s of intervals)cover(s.start,s.end);
 if(allFrames)for(let frame=0;frame/fps<duration;frame++)put(frame/fps);
 return {times:[...times].sort((a,b)=>a-b),intervals,maxStep,fps};
}
