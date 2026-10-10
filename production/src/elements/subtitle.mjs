/**
 * Whole-clause subtitle element in the existing 1920×1080 episode coordinates.
 * The caller supplies a validated timeline, tokens and drawing functions. This
 * module does not load content, fonts, assets or Canvas, and never changes them.
 */
export function createSubtitleElement({timeline,tokens,drawing}) {
 const {C,ramp,group,tx}=drawing;
 const metadata=Object.freeze({
  id:'whole-clause-subtitle',contractVersion:'1.0',
  coordinates:Object.freeze({width:1920,height:1080,centerX:960,singleLineBaseline:1010,
   multilineBaselines:Object.freeze([...tokens.spacing.subtitle_baselines])}),
  font:Object.freeze({size:tokens.type.subtitle,weight:700,familyRole:'sans-sc',
   baseline:'alphabetic',align:'center'}),
  fade:Object.freeze({inSeconds:.09,outSeconds:0,holdThrough:'segment.end',curve:'injected ramp'}),
  dependencies:Object.freeze(['timeline.segments','tokens.spacing.subtitle_baselines','tokens.type.subtitle','drawing.C/ramp/group/tx']),
 });
 function draw(c,t) {
  const s=timeline.segments.find(x=>t>=x.start&&t<x.end);if(!s)return;
  // Whole clauses remain visible through the planned breathing space.
  const a=ramp(t,s.start,.09);group(c,a,0,0,()=>{
   const ys=s.lines.length===1?[1010]:tokens.spacing.subtitle_baselines;
   s.lines.forEach((str,i)=>tx(c,str,960,ys[i],tokens.type.subtitle,700,C.ink,'center'));
  });
 }
 return Object.freeze({draw,metadata});
}
