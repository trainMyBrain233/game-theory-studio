/** Keep the historical entrance when it fits; compress only the remaining
 * owning window. Local normalized time avoids rounded absolute endpoints for
 * tiny legal cues, and the exact end always has a settled transform. */
export function windowProgress(ramp,t,start,end,d){
 if(end-start>=d)return ramp(t,start,d);
 return t>=end?1:t<=start?0:ramp((t-start)/(end-start),0,1);
}
export function revealWithinWindow(reveal,c,t,start,end=Infinity,fn,{d=.55,...options}={}){
 if(end-start>=d)return reveal(c,t,start,fn,{...options,d});
 const phase=t>=end?1:t<=start?0:(t-start)/(end-start);
 return reveal(c,phase,0,fn,{...options,d:1});
}
