// Negative/baseline renderer: replace only the fitted clock with its previous
// absolute-second arithmetic while preserving all other scene code.
export async function load(url,context,nextLoad){
 const result=await nextLoad(url,context);
 if(url.endsWith('/production/src/four-questions-timing.mjs'))return {...result,source:`
  import {ramp} from './motion.mjs';
  export function fourQuestionsState(t,s){const enter=ramp(t,s.start,.6),exit=ramp(t,s.end-.3,.25);return {enter,exit,alpha:enter*(1-exit),items:[0,1,2,3].map(i=>ramp(t,s.start+.35*i,.4))};}
 `};
 return result;
}
