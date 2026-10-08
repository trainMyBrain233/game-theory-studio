import test from 'node:test';
import assert from 'node:assert/strict';
import {createSubtitleElement} from '../production/src/elements/subtitle.mjs';
import {createPayoffMatrixElement,MATRIX_CELLS} from '../production/src/elements/payoff-matrix.mjs';

// A drawing recorder needs no Canvas, fonts, filesystem or production model.
function recorder() {
 const calls=[];
 const drawing={C:{ink:'#123456',faint:'#EFEFEF'},
  ramp:(t,start,d=.6)=>Math.max(0,Math.min(1,(t-start)/d)),
  group:(_c,a,x,y,fn)=>{calls.push(['group',a,x,y]);if(a>0)fn();},
  reveal:(_c,t,start,fn,options)=>{calls.push(['reveal',t,start,options]);if(t>start)fn();},
 };
 for(const name of ['tx','line','round'])drawing[name]=(_c,...args)=>calls.push([name,...args]);
 return {calls,drawing};
}
const tokens={spacing:{subtitle_baselines:[986,1043]},type:{subtitle:44}};
const subtitleTimeline={segments:[
 {start:2,end:5,voiceover_end:4,lines:['完整语义句。']},
 {start:5,end:8,voiceover_end:7,lines:['先读参与者，','再读两人的得分。']},
]};

test('subtitle preserves the complete clause through its tail pause and ends at the segment boundary',()=>{
 const {calls,drawing}=recorder(),element=createSubtitleElement({timeline:subtitleTimeline,tokens,drawing});
 element.draw(null,1.99);assert.deepEqual(calls,[]);
 element.draw(null,4.99);
 assert.deepEqual(calls,[['group',1,0,0],['tx','完整语义句。',960,1010,44,700,'#123456','center']]);
 calls.length=0;element.draw(null,8);assert.deepEqual(calls,[]);
});

test('subtitle uses injected type and both alphabetic baselines at the start of a new semantic block',()=>{
 const {calls,drawing}=recorder(),element=createSubtitleElement({timeline:subtitleTimeline,
  tokens:{spacing:{subtitle_baselines:[975,1031]},type:{subtitle:40}},drawing});
 element.draw(null,5);assert.deepEqual(calls,[['group',0,0,0]]);
 calls.length=0;element.draw(null,5.045);
 assert.ok(Math.abs(calls[0][1]-.5)<1e-12);
 assert.deepEqual(calls.slice(1),[
  ['tx','先读参与者，',960,975,40,700,'#123456','center'],
  ['tx','再读两人的得分。',960,1031,40,700,'#123456','center'],
 ]);
 assert.equal(element.metadata.font.baseline,'alphabetic');
 assert.equal(element.metadata.font.familyRole,'sans-sc');
 assert.equal(element.metadata.fade.outSeconds,0);
 assert.deepEqual(element.metadata.coordinates.multilineBaselines,[975,1031]);
});

function matrixTimeline() {
 return {segments:[
  {start:10,visual_cue:{action:'highlight_choices',matrix_cell:'BR'}},
  {start:12,visual_cue:{action:'reveal_scores',matrix_cell:'BR',scores:[17,4],
   score_reveals:[{player:'B',value:4,offset:1},{player:'A',value:17,offset:.5}]}},
  {start:18,visual_cue:{action:'highlight_choices',matrix_cell:'RB'}},
  {start:20,visual_cue:{action:'reveal_scores',matrix_cell:'RB',scores:[2,91],
   score_reveals:[{player:'A',value:2,offset:.5},{player:'B',value:91,offset:1}]}},
 ]};
}

test('matrix maps rows to A and columns to B independently of score event array order',()=>{
 const {calls,drawing}=recorder(),element=createPayoffMatrixElement({timeline:matrixTimeline(),summaryStart:30,drawing});
 element.scoreValues(null,13.5,'BR',300,400,32);
 assert.deepEqual(calls.filter(c=>c[0]==='tx'),[
  ['tx','(',237,410.5,32,400,'#123456','center'],
  ['tx',',',300,410.5,32,400,'#123456','center'],
  ['tx',')',363,410.5,32,400,'#123456','center'],
  ['tx','4',332,410.5,32,700,'#123456','center'],
  ['tx','17',268,410.5,32,700,'#123456','center'],
 ]);
 assert.deepEqual(calls.filter(c=>c[0]==='reveal').map(c=>[c[2],c[3]]),[
  [13,{d:.38,dy:6}],[12.5,{d:.38,dy:6}],
 ]);
 assert.equal(element.metadata.rowPlayer,'A');assert.equal(element.metadata.columnPlayer,'B');
 assert.deepEqual(element.metadata.scoreOrder,['A','B']);
 assert.deepEqual(MATRIX_CELLS.BR,[1,0]);
});

test('matrix follows current timeline events without prior-frame state or premature score drawing',()=>{
 const {calls,drawing}=recorder(),element=createPayoffMatrixElement({timeline:matrixTimeline(),summaryStart:30,drawing});
 assert.equal(element.currentCell(9),null);assert.equal(element.currentCell(18),'RB');
 assert.equal(element.currentCell(12),'BR');assert.equal(element.currentCell(10),'BR');
 element.scoreValues(null,11.99,'BR',300,400);element.scoreValues(null,100,'RR',300,400);
 assert.deepEqual(calls,[]);
 element.scoreValues(null,12.75,'BR',300,400);
 assert.deepEqual(calls.filter(c=>c[0]==='tx'&&/^\d+$/.test(c[1])).map(c=>c[1]),['17']);
});

test('matrix paints the selected BR fill before the grid, scores and final outline',()=>{
 const {calls,drawing}=recorder(),element=createPayoffMatrixElement({timeline:matrixTimeline(),summaryStart:30,drawing});
 element.draw(null,13.5);
 assert.deepEqual(calls[1],['round',783,676,474,164,0,'#EFEFEF',null]);
 assert.deepEqual(calls.slice(2,8),[
  ['line',780,503,1740,503,'#123456',3,1],
  ['line',780,673,1740,673,'#123456',3,1],
  ['line',780,843,1740,843,'#123456',3,1],
  ['line',780,503,780,843,'#123456',3,1],
  ['line',1260,503,1260,843,'#123456',3,1],
  ['line',1740,503,1740,843,'#123456',3,1],
 ]);
 assert.deepEqual(calls.at(-1),['round',783,676,474,164,0,null,'#123456',4]);
 assert.deepEqual(calls.filter(c=>c[0]==='line').slice(-2),[
  ['line',757,693,757,823,'#123456',5,1],
  ['line',830,488,1210,488,'#123456',5,1],
 ]);
});

test('matrix summary uses injected geometry and font scaling without obsolete highlight indicators',()=>{
 const {calls,drawing}=recorder(),element=createPayoffMatrixElement({timeline:matrixTimeline(),summaryStart:30,drawing});
 element.draw(null,30,{progress:.75,geometry:{x:1190,y:522,cw:267,ch:137},fontSize:48});
 assert.equal(calls.filter(c=>c[0]==='line').length,6);
 assert.equal(calls.filter(c=>c[0]==='round').length,0);
 assert.deepEqual(calls[0],['line',1190,522,1724,522,'#123456',3,.75]);
 assert.deepEqual(calls.filter(c=>c[0]==='tx'&&/^\d+$/.test(c[1])),[
  ['tx','2',1542.5,606.25,48,700,'#123456','center'],
  ['tx','91',1638.5,606.25,48,700,'#123456','center'],
  ['tx','4',1371.5,743.25,48,700,'#123456','center'],
  ['tx','17',1275.5,743.25,48,700,'#123456','center'],
 ]);
});

test('elements replay identically after unrelated times and leave timeline/tokens unchanged',()=>{
 const timeline=matrixTimeline(),before=JSON.stringify({timeline,tokens}),{calls,drawing}=recorder();
 const matrix=createPayoffMatrixElement({timeline,summaryStart:30,drawing});
 matrix.draw(null,13.5);const first=structuredClone(calls);
 calls.length=0;matrix.draw(null,31);matrix.draw(null,9);calls.length=0;matrix.draw(null,13.5);
 assert.deepEqual(calls,first);assert.equal(JSON.stringify({timeline,tokens}),before);
 assert.throws(()=>{matrix.metadata.cells.RR[0]=1;},TypeError);
 const subtitle=createSubtitleElement({timeline:subtitleTimeline,tokens,drawing});
 calls.length=0;subtitle.draw(null,6);const words=structuredClone(calls);
 calls.length=0;subtitle.draw(null,2.5);calls.length=0;subtitle.draw(null,6);
 assert.deepEqual(calls,words);
});
