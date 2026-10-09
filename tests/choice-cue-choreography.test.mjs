import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPayoffMatrixElement,MATRIX_CELLS} from '../production/src/elements/payoff-matrix.mjs';
import {ramp} from '../production/src/motion.mjs';
import {validateFirstEpisodeTimeline} from '../scripts/validate-data.mjs';
const source=JSON.parse(fs.readFileSync(new URL('../chapters/01-four-elements/narration/timeline.json',import.meta.url)));
const scenes=JSON.parse(fs.readFileSync(new URL('../design/scenes.json',import.meta.url)));
const fields=['rowProgress','columnProgress','fillProgress','borderProgress','labelAProgress','labelBProgress'];
const legacy=[[0,.45],[1.65,.45],[1.7,.55],[1.7,.5],[0,.55],[1.6,.55]];
function recorder(timeline) {
 const calls=[];let alpha=1;
 const drawing={C:{ink:'ink',faint:'faint'},ramp,
  group:(_c,a,x,y,fn)=>{const prior=alpha;alpha*=a;if(a>0)fn();alpha=prior;},
  reveal:()=>{},
 };
 for(const name of ['tx','line','round'])drawing[name]=(_c,...args)=>calls.push({name,alpha,args});
 return {calls,element:createPayoffMatrixElement({timeline,summaryStart:Infinity,drawing})};
}
function retime(scale) {
 const timeline=structuredClone(source);timeline.duration*=scale;
 for(const section of timeline.sections){section.start*=scale;section.end*=scale;}
 for(const segment of timeline.segments){
  for(const field of ['start','end','voiceover_end','spoken_duration','pause_after','display_duration'])segment[field]*=scale;
  for(const event of segment.visual_cue.score_reveals??[])event.offset*=scale;
  segment.visual_cue.score_reveals?.reverse();
 }
 validateFirstEpisodeTimeline(timeline,scenes);return timeline;
}
for(const [name,scale] of [['default',1],['positive retiming',1.3],['short',.3],['extremely short',1e-8]]) {
 test(`${name}: consumer state, selected geometry and both choice labels fit every legal cue`,()=>{
  const timeline=retime(scale),{element,calls}=recorder(timeline);
  for(const segment of timeline.segments.filter(s=>s.visual_cue.action==='highlight_choices')) {
   const {start,end,visual_cue:{matrix_cell:key}}=segment,window=end-start;
   const [row,column]=MATRIX_CELLS[key];
   const samples=[start-window*.001,start,start+window*.25,start+window*.5,start+window*.75,end-window*.001,end,end+window*.001];
   const snapshots=samples.map(t=>{
    const state=element.choiceState(t,key);
    assert.equal(state.row,row);assert.equal(state.column,column);
    for(const field of fields)assert(Number.isFinite(state[field])&&state[field]>=0&&state[field]<=1,field);
    if(window<2.25&&t>start&&t<end)fields.forEach((field,j)=>{
     const [offset,duration]=legacy[j];
     const p=Math.max(0,Math.min(1,((t-start)/window*2.25-offset)/duration));
     const expected=p*p*p*(10+p*(-15+6*p));
     assert(Math.abs(state[field]-expected)<1e-12,`${field} must share the cue-relative scale`);
    });
    if(t<=start)assert(fields.every(field=>state[field]===0));
    if(t>=end)assert(fields.every(field=>state[field]===1),'All final focus must be established at score start');
    return state;
   });
   assert(element.choiceState(end-window*.001,key).labelBProgress>0,'B label must enter inside its own cue');
   assert(element.choiceState(end-window*.001,key).borderProgress>0,'Cell border must enter inside its own cue');
   for(const i of [6,2,7,0,4,4,1,5,3])assert.deepEqual(element.choiceState(samples[i],key),snapshots[i]);
   calls.length=0;element.draw(null,end);element.choiceLabels(null,end);
   const rectangles=calls.filter(c=>c.name==='round');
   assert.deepEqual(rectangles.map(c=>c.args.slice(0,4)),Array(2).fill([783+column*480,506+row*170,474,164]));
   assert(rectangles.every(c=>c.alpha===1));
   const indicators=calls.filter(c=>c.name==='line').slice(-2);
   assert.deepEqual(indicators.map(c=>c.args),[
    [765,523+row*170,765,653+row*170,'ink',5,1],
    [830+column*480,488,1210+column*480,488,'ink',5,1],
   ]);
   const labels=calls.filter(c=>c.name==='tx'&&c.args[0].includes('选'));
   assert.deepEqual(labels.map(c=>[c.args[0],c.alpha]),[
    [`{{A}}选{{${row===0?'red':'blue'}}}`,1],[`{{B}}选{{${column===0?'red':'blue'}}}`,1],
   ]);
   const score=timeline.segments.find(s=>s.visual_cue.action==='reveal_scores'&&s.visual_cue.matrix_cell===key);
   assert.equal(end,score.start);
  }
 });
}
test('default and longer legal cues preserve every historical phase sample exactly',()=>{
 for(const timeline of [source,retime(1.3)]) {
  const {element}=recorder(timeline);
  for(const s of timeline.segments.filter(s=>s.visual_cue.action==='highlight_choices')) {
   for(let i=0;i<=500;i++) {
    const t=s.start+(s.end-s.start)*i/500,state=element.choiceState(t,s.visual_cue.matrix_cell);
    fields.forEach((field,j)=>assert.equal(state[field],ramp(t,s.start+legacy[j][0],legacy[j][1]),`${s.id} ${field} ${i}`));
   }
  }
 }
});
test('one-ULP cue has finite start state and an explicit final score-boundary state',()=>{
 const start=128,end=start+2**-45;
 const timeline={segments:[{start,end,visual_cue:{action:'highlight_choices',matrix_cell:'BR'}}]};
 const {element}=recorder(timeline);
 for(const field of fields){assert.equal(element.choiceState(start)[field],0);assert.equal(element.choiceState(end)[field],1);}
});
test('sub-microsecond legal overlap still completes focus at the actual score start',()=>{
 const timeline=retime(1e-8);
 for(const score of timeline.segments.filter(s=>s.visual_cue.action==='reveal_scores')) {
  const delta=(score.end-score.start)*.01;score.start-=delta;
  score.spoken_duration+=delta;score.display_duration+=delta;
 }
 validateFirstEpisodeTimeline(timeline,scenes);
 const {element}=recorder(timeline);
 for(const score of timeline.segments.filter(s=>s.visual_cue.action==='reveal_scores')) {
  const state=element.choiceState(score.start);
  assert(fields.every(field=>state[field]===1));
 }
});
