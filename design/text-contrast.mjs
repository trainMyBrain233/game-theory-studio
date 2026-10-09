/** Opaque sRGB text/background pairs actually used by the public renderers.
 * Decorative strokes and translucent transition frames are not text contrast claims.
 */
export function contrastRatio(a,b){
 const luminance=hex=>{
  if(!/^#[\da-f]{6}$/i.test(hex))throw Error(`Expected opaque #RRGGBB color: ${hex}`);
  return hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255)
   .map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
   .reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 };
 const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
const pair=(role,foreground,background,minimum=4.5)=>({role,foreground,background,minimum});
// This is the editorial selected-score role ONLY, not a general accent/wash exemption.
export const EDITORIAL_SELECTED_SCORE=Object.freeze({size:66,weight:700,minimum:3});
export function proposalTextPairs(tokens,id){
 const s=tokens.styles[id];
 const pairs=[pair('body ink/paper',s.ink,s.paper),pair('secondary muted/paper',s.muted,s.paper),
  pair('reverse badge paper/ink',s.paper,s.ink),
  ...['Red','Blue'].map(kind=>pair(`card white/strategy${kind}`,'#FFFFFF',tokens.semantic[`strategy${kind}`].fill))];
 if(id==='editorial')pairs.push(pair('annotation accent/paper',s.accent,s.paper),
  pair('selected score 66px bold accent/wash',s.accent,s.wash,EDITORIAL_SELECTED_SCORE.minimum));
 else pairs.push(pair('selected score ink/wash',s.ink,s.wash));
 if(id==='bright')pairs.push(pair('callout ink/accent',s.ink,s.accent),
  pair('result ink/lilac',s.ink,'#DAD4EA'),pair('stage ink/cream',s.ink,'#F7F0DB'));
 return pairs;
}
export function productionTextPairs(colors,cardLabel='#FFFEF8'){
 return [pair('body ink/paper',colors.ink,colors.paper,7),pair('secondary/paper',colors.secondary,colors.paper,7),
  pair('selected scores and explanatory tags ink/focus_fill',colors.ink,colors.focus_fill),
  pair('reverse badge white/ink','#FFFFFF',colors.ink),
  pair('card label/red_strategy',cardLabel,colors.red_strategy),pair('card label/blue_strategy',cardLabel,colors.blue_strategy)];
}
export function inspectTextContrast(pairs){return pairs.map(p=>({...p,ratio:contrastRatio(p.foreground,p.background)}));}
export function assertTextContrast(pairs){
 const results=inspectTextContrast(pairs),bad=results.filter(p=>p.ratio<p.minimum);
 if(bad.length)throw Error('Text contrast: '+bad.map(p=>`${p.role} ${p.foreground}/${p.background} = ${p.ratio.toFixed(3)}:1 < ${p.minimum}:1`).join('; '));
 return results;
}
