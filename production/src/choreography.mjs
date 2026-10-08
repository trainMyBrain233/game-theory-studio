/** Shared card/hand choreography. Both actors use exactly the same phases. */
import {timeline,sceneData} from './model.mjs';
import {kinematicRamp as ramp,mix,pulse} from './motion.mjs';
import {cardTransform,cardAttachment} from './card-transform.mjs';
const T=id=>timeline.segments.find(s=>s.id===id).start;
export function informationChoreography(t,{selected=sceneData.selected}={}){
 const pick=T('s08_known_unknown')+1.25;
 const move=ramp(t,pick+.5,1.3),unused=1-ramp(t,pick+.4,.6);
 const reveal=ramp(t,T('s09_simultaneous')+1.7,.9);
 const hidden=ramp(t,T('s08_known_unknown')+2.35,.85)*(1-reveal);
 const cy=786-24*pulse(t,pick+.35,2.4)-18*pulse(t,T('s09_simultaneous')+1.3,2.1);
 const gripPick=ramp(t,pick,.5)*(1-ramp(t,pick+2.65,.65));
 const gripReveal=ramp(t,T('s09_simultaneous')+1.15,.45)*(1-ramp(t,T('s09_simultaneous')+3.15,.65));
 const grip=Math.max(gripPick,gripReveal);
 const cards={A:{kind:selected.actorA,x:mix(selected.row===0?408:546,470,move),y:cy,w:105,angle:-.035},B:{kind:selected.actorB,x:mix(selected.column===0?1370:1508,1444,move),y:cy,w:105,angle:.035}};
 for(const [id,card] of Object.entries(cards))card.attachment=cardAttachment(cardTransform(card),id==='A'?1:-1);
 return {move,unused,reveal,hidden,grip,cards,
   handTarget(id,rest){const target=cards[id].attachment.world;return [mix(rest[0],target[0],grip),mix(rest[1],target[1],grip)]}};
}
