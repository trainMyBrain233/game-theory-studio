/** All comparison-only raster text. Rendering and glyph QA share this pure plan.
 * Captions remain 30px when the 3840px board is viewed at 1920px width.
 * Their middle baseline leaves room below the header divider without moving scenes.
 */
export const COMPARISON_BOARD=Object.freeze({width:3840,height:1320,headerHeight:200});
export function comparisonBoardTextPlan(style){
 return [
  {id:'heading',text:style.name,x:84,y:83,size:62,weight:700,color:style.ink,align:'left',family:style.titleFamily},
  {id:'subtitle',text:style.subtitle,x:3756,y:83,size:38,weight:400,color:style.muted,align:'right',family:'sans'},
  {id:'participants-caption',text:'场景一 · 参与者',x:84,y:165,size:60,weight:700,color:style.ink,align:'left',family:'sans'},
  {id:'payoff-caption',text:'场景二 · 收益矩阵',x:2004,y:165,size:60,weight:700,color:style.ink,align:'left',family:'sans'},
 ];
}
