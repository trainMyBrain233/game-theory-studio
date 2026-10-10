/** Shared card/hand choreography. Both actors use exactly the same phases. */
import {timeline,sceneData} from './model.mjs';
import {kinematicRamp as ramp,ramp as graphicRamp,mix,pulse} from './motion.mjs';
import {cardTransform,cardAttachment} from './card-transform.mjs';
import {windowClock} from './scene-window-timing.mjs';
export function informationChoreography(t,{selected=sceneData.selected,timeline:timing=timeline}={}){
 const segment=id=>timing.segments.find(s=>s.id===id);
 const known=windowClock(t,segment('s08_known_unknown'),4.8);
 const together=windowClock(t,segment('s09_simultaneous'),4.1);
 const pick=known.start+1.25;
 const move=ramp(known.time,pick+.5,1.3),unused=1-ramp(known.time,pick+.4,.6);
 const reveal=ramp(together.time,together.start+1.7,.9);
 const hidden=ramp(known.time,known.start+2.35,.85)*(1-reveal);
 const cy=786-24*pulse(known.time,pick+.35,2.4)-18*pulse(together.time,together.start+1.3,2.1);
 const gripPick=ramp(known.time,pick,.5)*(1-ramp(known.time,pick+2.65,.65));
 const gripReveal=ramp(together.time,together.start+1.15,.45)*(1-ramp(together.time,together.start+3.15,.65));
 const grip=Math.max(gripPick,gripReveal);
 const cards={A:{kind:selected.actorA,x:mix(selected.row===0?408:546,470,move),y:cy,w:105,angle:-.035},B:{kind:selected.actorB,x:mix(selected.column===0?1370:1508,1444,move),y:cy,w:105,angle:.035}};
 for(const [id,card] of Object.entries(cards))card.attachment=cardAttachment(cardTransform(card),id==='A'?1:-1);
 const observation=graphicRamp(known.time,known.start+2.6,.65)*(1-graphicRamp(together.time,together.start+1.35,.3));
 const rules=graphicRamp(known.time,known.start,.55);
 const explanation=1-graphicRamp(together.time,together.end-.3,.25);
 return {move,unused,reveal,hidden,grip,cards,observation,rules,explanation,
   handTarget(id,rest){const target=cards[id].attachment.world;return [mix(rest[0],target[0],grip),mix(rest[1],target[1],grip)]}};
}
