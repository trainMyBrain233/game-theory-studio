/**
 * Two-player, two-strategy payoff matrix with timeline-owned reveal events.
 * Validated content and every drawing dependency are injected by the caller.
 * No chapter IDs, IO, font registration or hidden frame state live here.
 */
export const MATRIX_CELLS=Object.freeze({
 RR:Object.freeze([0,0]),RB:Object.freeze([0,1]),
 BR:Object.freeze([1,0]),BB:Object.freeze([1,1]),
});
const DEFAULT_GEOMETRY=Object.freeze({x:780,y:503,cw:480,ch:170});

export function createPayoffMatrixElement({timeline,summaryStart,drawing}) {
 const {C,ramp,group,round,line,tx,reveal}=drawing;
 const metadata=Object.freeze({
  id:'two-player-payoff-matrix',contractVersion:'1.0',
  rowPlayer:'A',columnPlayer:'B',scoreOrder:Object.freeze(['A','B']),
  strategyOrder:Object.freeze(['red','blue']),cells:MATRIX_CELLS,
  geometry:DEFAULT_GEOMETRY,
  score:Object.freeze({defaultFontSize:64,weight:700,familyRole:'sans-sc',baseline:'alphabetic',
   baselineOffsetAt64:21,playerXOffsetsAt64:Object.freeze({A:-64,B:64}),
   punctuationXOffsetsAt64:Object.freeze([-126,0,126]),revealSeconds:.38,revealDy:6}),
  highlight:Object.freeze({rowIndicatorX:757,columnIndicatorY:488,inset:3,
   scope:'fixed episode coordinates; recap summary moves the grid without active indicators'}),
  dependencies:Object.freeze(['timeline.segments.visual_cue','summaryStart','drawing.C/ramp/group/round/line/tx/reveal']),
 });
 function scoreValues(c,t,key,cx,cy,size=64) {
  const s=timeline.segments.find(s=>s.visual_cue.action==='reveal_scores'&&s.visual_cue.matrix_cell===key);if(!s||t<s.start)return;
  const reveals=s.visual_cue.score_reveals;
  tx(c,'(',cx-126*size/64,cy+21*size/64,size,400,C.ink,'center');tx(c,',',cx,cy+21*size/64,size,400,C.ink,'center');tx(c,')',cx+126*size/64,cy+21*size/64,size,400,C.ink,'center');
  reveals.forEach(r=>reveal(c,t,s.start+r.offset,()=>tx(c,String(r.value),cx+(r.player==='A'?-64:64)*size/64,cy+21*size/64,size,700,C.ink,'center'),{d:.38,dy:6}));
 }
 function currentCell(t) {
  return timeline.segments.filter(s=>s.start<=t&&s.visual_cue.matrix_cell).at(-1)?.visual_cue.matrix_cell||null;
 }
 // Preserve the historical 2.25s choreography on normal cues. Short cues
 // compress all six entrances together, including the explanatory labels.
 // Evaluate short windows in local time to avoid rounded absolute start offsets.
 function choiceState(t,key=currentCell(t)) {
  const s=timeline.segments.find(s=>s.visual_cue.action==='highlight_choices'&&s.visual_cue.matrix_cell===key);
  if(!s)return null;
  const score=timeline.segments.find(s=>s.visual_cue.action==='reveal_scores'&&s.visual_cue.matrix_cell===key);
  // The validator tolerates sub-microsecond continuity differences; neither
  // the cue end nor an earlier score start may retain unfinished entrances.
  const end=Math.min(s.end,score?.start??s.end),window=end-s.start;
  const phase=(offset,duration)=>t>=end?1:t<=s.start?0:
   window>=2.25?ramp(t,s.start+offset,duration):ramp((t-s.start)/window,offset/2.25,duration/2.25);
  return {key,row:MATRIX_CELLS[key][0],column:MATRIX_CELLS[key][1],
   rowProgress:phase(0,.45),columnProgress:phase(1.65,.45),
   fillProgress:phase(1.7,.55),borderProgress:phase(1.7,.5),
   labelAProgress:phase(0,.55),labelBProgress:phase(1.6,.55)};
 }
 function choiceLabels(c,t) {
  const state=choiceState(t);if(!state)return;
  for(const [owner,index,progress,y] of [
   ['A',state.row,state.labelAProgress,580],['B',state.column,state.labelBProgress,642],
  ])group(c,progress,0,(1-progress)*12,()=>tx(c,`{{${owner}}}选`+(index===0?'{{red}}':'{{blue}}'),100,y,36,700));
 }
 function draw(c,t,{progress=1,geometry=DEFAULT_GEOMETRY,fontSize=64}={}) {
  const {x,y,cw,ch}=geometry;
  const key=currentCell(t),current=MATRIX_CELLS[key];
  const showSummary=t>=summaryStart;
  if(current&&!showSummary){const state=choiceState(t,key);group(c,state.fillProgress,0,0,()=>round(c,x+current[1]*cw+3,y+current[0]*ch+3,cw-6,ch-6,0,C.faint,null));}
  // Grid and score call order is retained for identical compositing.
  line(c,x,y,x+cw*2,y,C.ink,3,progress);line(c,x,y+ch,x+cw*2,y+ch,C.ink,3,progress);line(c,x,y+2*ch,x+cw*2,y+2*ch,C.ink,3,progress);
  line(c,x,y,x,y+2*ch,C.ink,3,progress);line(c,x+cw,y,x+cw,y+2*ch,C.ink,3,progress);line(c,x+2*cw,y,x+2*cw,y+2*ch,C.ink,3,progress);
  Object.entries(MATRIX_CELLS).forEach(([key,[r,co]])=>scoreValues(c,t,key,x+co*cw+cw/2,y+r*ch+ch/2,fontSize));
  if(current&&!showSummary){const state=choiceState(t,key),pr=state.rowProgress,pc=state.columnProgress;
   // Indicators remain in the episode's dedicated grid gutters.
   line(c,757,y+current[0]*ch+20,757,y+(current[0]+1)*ch-20,C.ink,5,pr);
   line(c,x+current[1]*cw+50,488,x+(current[1]+1)*cw-50,488,C.ink,5,pc);
   group(c,state.borderProgress,0,0,()=>round(c,x+current[1]*cw+3,y+current[0]*ch+3,cw-6,ch-6,0,null,C.ink,4));
  }
 }
 return Object.freeze({draw,currentCell,choiceState,choiceLabels,scoreValues,metadata});
}
