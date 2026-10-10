/** Pure, time-driven motion shared by text, choreography and character rigs.
 * No renderer, content model, IO or global clock is consulted here.
 */
export const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const mix=(a,b,p)=>a+(b-a)*p;

/** The graphics curve retains the original operation order for pixel stability. */
export const ease=x=>{x=clamp(x);return x*x*x*(x*(x*6-15)+10)};
/** Same quintic curve, with the explicit historical kinematic expression.
 * Preserve both expressions during extraction rather than introducing a
 * reassociated polynomial into poses or card/hand choreography.
 */
export const kinematicEase=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x))};
export const ramp=(t,start,d=.6)=>ease((t-start)/d);
export const kinematicRamp=(t,start,d)=>kinematicEase((t-start)/d);
export const span=(t,a,b)=>ramp(t,a,.4)*(1-ramp(t,b-.4,.4));
export const pulse=(t,start,d)=>t<start||t>start+d?0:Math.sin(Math.PI*(t-start)/d)**2;

/** A renderer-neutral transform. Canvas group() consumes this same contract. */
export function transformState(alpha,dx=0,dy=0){
 return {visible:!(alpha<=0),alpha:clamp(alpha),dx,dy};
}

/** Reusable text entrance/exit state, driven only by explicit time.
 * Exit begins at exitStart; it never shortens the configured hold window.
 * With no exit configured this is exactly the episode's existing reveal().
 */
export function textTransitionState(t,start,{d=.55,dy=12,exitStart=Infinity,exitDuration=.55,exitDy=0,offsetBy='entry'}={}){
 const entered=ramp(t,start,d),exited=exitStart===Infinity?0:ramp(t,exitStart,exitDuration);
 const alpha=entered*(1-exited),offset=(1-(offsetBy==='visibility'?alpha:entered))*dy;
 return {...transformState(alpha,0,exited===0?offset:offset+exited*exitDy),entered,exited};
}
