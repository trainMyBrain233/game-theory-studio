export async function load(url,context,nextLoad){
 const result=await nextLoad(url,context);
 if(url.endsWith('/production/src/hook-timing.mjs'))return {...result,source:`
 import {ramp} from './motion.mjs';
 export function hookState(t,s){const reveal=ramp(t,1.4,.55),alpha=1-ramp(t,s.end-.32,.27);return {actors:ramp(t,.4,.75),names:t>1.6,reveal,alpha,arrowA:ramp(t,2,.7),arrowB:ramp(t,2.35,.7),questionAlpha:reveal*alpha};}
 `};
 return result;
}
