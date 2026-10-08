/** Shared card/hand choreography. Both actors use exactly the same phases. */
import fs from 'node:fs';
const timeline=JSON.parse(fs.readFileSync(new URL('../narration/timeline.json',import.meta.url),'utf8'));
const T=id=>timeline.segments.find(s=>s.id===id).start;
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x))};
const ramp=(t,a,d)=>ease((t-a)/d);
const mix=(a,b,p)=>a+(b-a)*p;
const pulse=(t,a,d)=>t<a||t>a+d?0:Math.sin(Math.PI*(t-a)/d)**2;
export function informationChoreography(t){
 const pick=T('s08_known_unknown')+1.25;
 const move=ramp(t,pick+.5,1.3),unused=1-ramp(t,pick+.4,.6);
 const reveal=ramp(t,T('s09_simultaneous')+1.7,.9);
 const hidden=ramp(t,T('s08_known_unknown')+2.35,.85)*(1-reveal);
 const cy=786-24*pulse(t,pick+.35,2.4)-18*pulse(t,T('s09_simultaneous')+1.3,2.1);
 const gripPick=ramp(t,pick,.5)*(1-ramp(t,pick+2.65,.65));
 const gripReveal=ramp(t,T('s09_simultaneous')+1.15,.45)*(1-ramp(t,T('s09_simultaneous')+3.15,.65));
 const grip=Math.max(gripPick,gripReveal);
 return {move,unused,reveal,hidden,grip,cards:{A:{kind:'red',x:mix(408,470,move),y:cy,w:105},B:{kind:'blue',x:mix(1508,1444,move),y:cy,w:105}},
   handTarget(id,rest){const card=this.cards[id],target=[card.x,card.y-52];return [mix(rest[0],target[0],grip),mix(rest[1],target[1],grip)]}};
}
