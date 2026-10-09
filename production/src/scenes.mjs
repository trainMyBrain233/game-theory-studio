export {timeline,content} from './model.mjs';
import {timeline,content,sceneData} from './model.mjs';
import {informationChoreography} from './choreography.mjs';
import {comparisonState} from './comparison-timing.mjs';
import {textTransitionState} from './motion.mjs';
import {proposalScale} from '../../design/canvas-geometry.mjs';
import {beforeEnd} from './frame-time.mjs';
import {createSubtitleElement} from './elements/subtitle.mjs';
import {createPayoffMatrixElement} from './elements/payoff-matrix.mjs';
import {TOKENS,C,clamp,ease,mix,ramp,span,tx,line,round,circle,arrow,group,reveal,person,badge,card,cardFlip,tag,desk,eye,resetRecords,setSceneTime,finishActorLayers,assertAssetsReady} from './primitives.mjs';
export const W=TOKENS.canvas.width,H=TOKENS.canvas.height,FPS=TOKENS.canvas.fps,DURATION=timeline.duration;
// The timeline end is exclusive. Use its Float64 predecessor only for an
// endpoint/out-of-range request; every valid in-window time stays unchanged,
// including sub-frame tail segments and their still-checkpoint timestamps.
const lastFrameTime=beforeEnd(DURATION);
const S=id=>timeline.segments.find(s=>s.id===id);
const T=id=>S(id).start;
const SEC=id=>timeline.sections.find(s=>s.id===id);
const {draw:subtitle}=createSubtitleElement({timeline,tokens:TOKENS,drawing:{C,ramp,group,tx}});
const {draw:matrix,currentCell,choiceLabels}=createPayoffMatrixElement({timeline,summaryStart:T('s32_joint_choices'),drawing:{C,ramp,group,round,line,tx,reveal}});
export const designTokens=TOKENS;
const sections={intro:{no:'00',name:'四个问题',title:'为什么要琢磨对方怎么选？',lead:'两个人，都想让自己的得分更高。'},players:{no:'01',name:'参与者',title:'谁在做决定？',lead:'先认识做决定的人，和他们各自的目标。'},information:{no:'02',name:'信息',title:'做决定时，知道什么？',lead:'公开的规则，和看不到的当前选择。'},strategy:{no:'03',name:'策略',title:'能怎样选择？',lead:'先看这一轮，再理解一整套应对计划。'},payoffs:{no:'04',name:'收益',title:'不同选择，各得什么？',lead:'先找选择组合，再读两个人的得分。'},recap:{no:'05',name:'四问复盘',title:'四个问题，先把博弈说清楚',lead:'参与者、信息、策略、收益。'}};
const secAt=t=>timeline.sections.find(s=>t>=s.start&&t<s.end)||timeline.sections.at(-1);
function chapter(c,t){
 const sec=secAt(t),conf=sections[sec.id];
 tx(c,'博弈论入门',84,84,31,700);tx(c,sec.id==='recap'?'四问复盘':'一轮积分游戏 · 虚构教学案例',1836,84,27,400,C.muted,'right');
 line(c,84,116,1836,116,C.light,1.5);
 const state=textTransitionState(t,sec.id==='intro'?0:sec.start+.06,{d:sec.id==='intro'?.55:.42,dy:12,exitStart:sec.id==='recap'?Infinity:sec.end-.3,exitDuration:.25});
 group(c,state.alpha,state.dx,state.dy,()=>{
  round(c,84,165,62,62,0,C.ink,null);tx(c,conf.no,115,209,30,700,C.white,'center');
  tx(c,conf.title,178,226,sec.id==='recap'?65:72,700,C.ink,'left',{serif:TOKENS.titleFamily==='serif'});tx(c,conf.lead,178,291,33,400,C.muted);
 });
 // Progress is a quiet reading aid; it does not change semantic color mappings.
 const filled=(t/DURATION)*1752;line(c,84,936,1836,936,C.light,1);line(c,84,936,84+filled,936,C.ink,2);
}
function definition(c,label,text,t,start,{end=1e9}={}){const state=textTransitionState(t,start,{d:.5,dy:9,exitStart:end-.3,exitDuration:.25,offsetBy:'visibility'});group(c,state.alpha,state.dx,state.dy,()=>{line(c,84,869,84,913,C.ink,7);tx(c,label,113,905,34,700);tx(c,text,292,905,33,400)})}
function duo(c,t,{alpha=1,spread=0,cards=true,names=true,hidden=0,cardY=786}={}){
 const s=mix(.84,.66,spread),ax=mix(260,115,spread),bx=mix(1284,1528,spread),y=mix(357,443.2,spread);
 desk(c,alpha,760,mix(230,88,spread),mix(1688,1832,spread));person(c,'A',ax,y,s,alpha);person(c,'B',bx,y,s,alpha);
 if(names)group(c,alpha,0,0,()=>{badge(c,'A',mix(330,156,spread),mix(356,398,spread),24,{name:true});badge(c,'B',mix(1335,1570,spread),mix(324,398,spread),24,{name:true})});
 if(cards)group(c,alpha,0,0,()=>{
  cardFlip(c,'red','back',408,cardY,105,hidden,{angle:-.055});cardFlip(c,'blue','back',546,cardY,105,hidden,{angle:.045});
  cardFlip(c,'red','back',1370,cardY,105,hidden,{angle:-.04});cardFlip(c,'blue','back',1508,cardY,105,hidden,{angle:.05});
 });
}
function intro(c,t){
 duo(c,t,{alpha:ramp(t,.4,.75),names:t>1.6});
 const q=ramp(t,T('s02_four_questions'),.6);
 group(c,1-ramp(t,T('s02_four_questions')-.32,.27),0,-q*16,()=>{
  reveal(c,t,1.4,()=>{tx(c,'我的选择',810,497,34,700,C.ink,'center');tx(c,'对方的选择',1110,497,34,700,C.ink,'center');
   arrow(c,760,550,895,550,ramp(t,2,.7));arrow(c,1160,550,1025,550,ramp(t,2.35,.7));
   tx(c,'怎样影响得分？',960,631,43,700,C.ink,'center');});
 });
 if(q>0)group(c,q*(1-ramp(t,SEC('intro').end-.3,.25)),0,(1-q)*16,()=>{
  ['参与者','信息','策略','收益'].forEach((str,i)=>{const p=ramp(t,T('s02_four_questions')+.35*i,.4);group(c,p,0,(1-p)*12,()=>{tx(c,String(i+1).padStart(2,'0'),745+i*143,478,27,700,C.muted,'center');tx(c,str,745+i*143,548,34,700,C.ink,'center');line(c,698+i*143,575,792+i*143,575,C.light,2)})});
  tx(c,'把一场博弈，先说明白。',960,661,36,400,C.ink,'center');
 });
}
function players(c,t){
 duo(c,t);
 const goal=ramp(t,T('s05_goal'),.6),def=ramp(t,T('s06_definition'),.6);
 group(c,1-ramp(t,T('s05_goal')-.3,.25),0,0,()=>{tx(c,'{{A}}与{{B}}',960,478,39,700,C.ink,'center');tx(c,'各选一张牌',960,549,43,700,C.ink,'center');line(c,815,585,1105,585,C.light,2)});
 group(c,goal*(1-ramp(t,SEC('players').end-.3,.25)),0,(1-goal)*10,()=>{
  tx(c,'各自的目标',960,432,31,400,C.muted,'center');
  tx(c,'让自己的得分更高',960,508,43,700,C.ink,'center');
  arrow(c,696,551,825,551,goal);arrow(c,1224,551,1095,551,goal);
  if(def>0)group(c,def,0,(1-def)*8,()=>{tx(c,'谁能决定？',960,637,38,700,C.ink,'center');tx(c,'在乎什么？',960,700,38,700,C.ink,'center')});
 });
 definition(c,'参与者','能作出决策的个体或组织',t,T('s06_definition'),{end:SEC('players').end});
}
function information(c,t){
 const choreography=informationChoreography(t),revealP=choreography.reveal,hidden=choreography.hidden;
 duo(c,t,{cards:false});
 // One selected card per person; the unused option withdraws before the back flips.
 const choose=choreography.move,ca=choreography.cards.A,cb=choreography.cards.B;
 cardFlip(c,ca.kind,'back',ca.x,ca.y,ca.w,hidden,{angle:ca.angle});
 cardFlip(c,cb.kind,'back',cb.x,cb.y,cb.w,hidden,{angle:cb.angle});
 group(c,choreography.unused,0,choose*34,()=>{card(c,sceneData.selected.row===0?'blue':'red',sceneData.selected.row===0?546:408,786,105);card(c,sceneData.selected.column===0?'blue':'red',sceneData.selected.column===0?1508:1370,786,105)});
 reveal(c,t,T('s08_known_unknown'),()=>tag(c,'计分规则：双方都知道',738,377,444,{size:30}));
 const dist=ramp(t,T('s10_distinction'),.5),summ=ramp(t,T('s11_timing'),.55);
 group(c,1-ramp(t,T('s10_distinction')-.3,.25),0,-dist*10,()=>{
  const observation=ramp(t,T('s08_known_unknown')+2.6,.65)*(1-ramp(t,T('s09_simultaneous')+1.35,.3));
  group(c,observation,0,0,()=>{
   eye(c,690,507,.8);line(c,737,507,1192,507,C.muted,3,1,true);line(c,1192,507,1374,699,C.muted,3,1,true);
   line(c,1359,686,1390,710,C.ink,4); // the opaque card is the stopping boundary
   tx(c,'{{A}}此时看不到',968,571,32,700,C.ink,'center');
   tx(c,'对方选的那张牌',968,622,32,400,C.ink,'center');
  });
  group(c,revealP,0,(1-revealP)*10,()=>{tx(c,'先各自选好',960,541,37,700,C.ink,'center');tx(c,'再一起亮牌',960,621,42,700,C.ink,'center');});
 });
 group(c,dist*(1-ramp(t,T('s11_timing')-.3,.25)),0,0,()=>{tx(c,'知道规则',960,524,42,700,C.ink,'center');tx(c,'≠',960,591,55,400,C.ink,'center');tx(c,'知道本轮选择',960,663,42,700,C.ink,'center')});
 group(c,summ*(1-ramp(t,SEC('information').end-.3,.25)),0,(1-summ)*10,()=>{tag(c,'行动顺序',802,493,316,{fill:C.paper,stroke:C.light,size:35});tag(c,'可见信息',802,598,316,{fill:C.paper,stroke:C.light,size:35})});
 definition(c,'信息','行动顺序与决策时能观察到的内容',t,T('s11_timing'),{end:SEC('information').end});
}
function strategy(c,t){
 const comparison=comparisonState(t,timeline);
 const spread=ramp(t,SEC('strategy').start,.9),{multi,back}=comparison,m=multi*(1-back);
 const sx=mix(260,115,spread),sy=mix(357,443.2,spread),ss=mix(.84,.66,spread);
 desk(c,1-m,760,mix(230,88,spread*(1-back)),mix(1688,1832,spread*(1-back)));
 // A stays physically present; B moves out of the comparison, then returns.
 person(c,'A',mix(mix(sx,110,multi),260,back),mix(mix(sy,470,multi),357,back),mix(mix(ss,.57,multi),.84,back));
 person(c,'B',mix(mix(mix(1284,1528,spread),1960,multi),1284,back),mix(mix(357,443.2,spread),357,back),mix(mix(.84,.66,spread),.84,back));
 const namesAlpha=1-ramp(t,T('s16_comparison_intro')-.3,.25);group(c,namesAlpha,0,0,()=>{badge(c,'A',mix(330,156,spread),mix(356,398,spread),24,{name:true});badge(c,'B',mix(1335,1570,spread),mix(324,398,spread),24,{name:true})});
 const compAlpha=comparison.comparisonAlpha;
 group(c,compAlpha,0,0,()=>badge(c,'A',188,432,23,{name:true}));
 group(c,comparison.names,0,0,()=>{badge(c,'A',330,356,24,{name:true});badge(c,'B',1335,324,24,{name:true})});
 
 const rx=mix(mix(mix(470,830,spread),532,multi),408,back),ry=mix(mix(mix(786,581,spread),634,multi),786,back),rw=mix(mix(mix(105,147,spread),118,multi),105,back);
 const hide=comparison.hidden;cardFlip(c,'red','back',rx,ry,rw,hide);
 group(c,(1-multi)*(1-back),0,0,()=>card(c,'blue',mix(1444,1090,spread),mix(786,581,spread)+multi*130,mix(105,147,spread)));
 group(c,back,0,0,()=>{card(c,'blue',546,786,105);card(c,'red',1370,786,105);card(c,'blue',1508,786,105)});
 const baseText=1-ramp(t,T('s16_comparison_intro')-.45,.3);
 group(c,baseText,0,0,()=>{
  group(c,1-ramp(t,T('s15_definition')-.35,.3),0,0,()=>reveal(c,t,T('s13_options'),()=>tx(c,'每个人都可以选择',960,411,35,400,C.muted,'center')));
  // Keep the 735px settled baseline; the shorter entrance clears the desk
  // even on the first nonzero-alpha frame, before the caption is easy to see.
  reveal(c,t,T('s14_simple_case'),()=>tx(c,'本例：只有一次决策',960,735,32,700,C.ink,'center'),{dy:8});
  reveal(c,t,T('s14_simple_case'),()=>tx(c,'两个纯策略',960,839,39,700,C.ink,'center'));
  reveal(c,t,T('s15_definition'),()=>tx(c,'策略：一整套应对计划',960,400,39,700,C.ink,'center'));
 });
 group(c,compAlpha,0,0,()=>{
  tag(c,'如果改成多轮：概念对照',591,350,738,{size:33});
  group(c,comparison.first,0,(1-comparison.first)*12,()=>{tx(c,'第一轮',532,513,35,700,C.ink,'center');tx(c,'选{{red}}',532,766,34,700,C.ink,'center')});
  const plan=comparison.plan;
  group(c,plan,0,0,()=>{
   arrow(c,632,632,795,632,plan);round(c,828,559,308,147,14,C.faint,C.light,2);tx(c,'从第二轮起',982,613,34,700,C.ink,'center');tx(c,'看对方上一轮',982,666,32,400,C.ink,'center');
   line(c,1136,632,1220,632,C.ink,3);line(c,1220,527,1220,732,C.ink,3);arrow(c,1220,527,1336,527);arrow(c,1220,732,1336,732);
  });
  group(c,comparison.red,0,(1-comparison.red)*12,()=>{tx(c,'对方选{{red}}',1250,468,30,700,C.ink,'center');card(c,'red',1430,527,100);tx(c,'自己选{{red}}',1570,539,33,700)});
  group(c,comparison.blue,0,(1-comparison.blue)*12,()=>{tx(c,'对方选{{blue}}',1250,806,30,700,C.ink,'center');card(c,'blue',1430,732,100);tx(c,'自己选{{blue}}',1570,744,33,700)});
 });
 group(c,comparison.single*(1-comparison.singleExit),0,0,()=>{tx(c,'回到本片',960,483,33,400,C.muted,'center');tx(c,'仍然只玩一轮',960,570,43,700,C.ink,'center')});
}
function payoffs(c,t){
 const move=ramp(t,T('s21_rows')+.1,1.2),rows=ramp(t,T('s21_rows')+1.5,.45),cols=ramp(t,T('s22_columns'),.65),oldExit=1-ramp(t,T('s21_rows')-.45,.42);
 group(c,oldExit,0,(1-oldExit)*120,()=>{duo(c,t,{cards:false,names:false});
  reveal(c,t,T('s19_question'),()=>tx(c,'不同选择的结果',960,505,41,700,C.ink,'center'));
  reveal(c,t,T('s20_definition'),()=>tx(c,'收益（支付）',960,603,48,700,C.ink,'center'));
 });
 // Identity and choice objects physically migrate into row/column labels.
 const ba={x:mix(330,565,move),y:mix(356,630,move)},bb={x:mix(1335,1211,move),y:mix(324,350,move)};
 badge(c,'A',ba.x,ba.y,25);badge(c,'B',bb.x,bb.y,25);
 group(c,oldExit,0,0,()=>{tx(c,'{{A}}',371,367,32,700);tx(c,'{{B}}',1376,335,32,700)});group(c,ramp(t,T('s21_rows')+1.35,.3),0,0,()=>{tx(c,'{{A}}',565,699,32,700,C.ink,'center');tx(c,'{{B}}',1263,361,32,700)});
 card(c,'red',mix(408,707,move),mix(786,588,move),mix(105,82,move),{angle:mix(-.035,0,move)});card(c,'blue',mix(546,707,move),mix(786,758,move),mix(105,82,move));
 card(c,'red',mix(1370,1020,move),mix(786,426,move),mix(105,73,move));card(c,'blue',mix(1508,1500,move),mix(786,426,move),mix(105,73,move));
 if(move>0)group(c,move,0,0,()=>{matrix(c,t,{progress:ramp(t,T('s21_rows')+1.5,.7)});
  group(c,rows,0,0,()=>tx(c,'行',565,566,29,700,C.muted,'center'));
  group(c,cols,0,0,()=>tx(c,'列',1157,361,29,700,C.muted,'right'));
 });
 if(t>=T('s21_rows')+1.5){
  const order=ramp(t,T('s23_score_order'),.5),key=currentCell(t),summary=ramp(t,T('s32_joint_choices'),.5),beyond=ramp(t,T('s33_beyond_money'),.6);
  group(c,1-ramp(t,T('s23_score_order')-.3,.25),0,0,()=>{tx(c,t<T('s22_columns')?'先找{{A}}的行':'再找{{B}}的列',100,465,40,700);tx(c,t<T('s22_columns')?'{{red}}与{{blue}}，两种选择':'{{red}}与{{blue}}，两种选择',100,533,31,400,C.muted)});
  group(c,order*(1-ramp(t,T('s33_beyond_money')-.3,.25)),0,0,()=>{
   tx(c,'每格的读法',100,400,31,400,C.muted);tx(c,'先{{A}}，再{{B}}',100,465,39,700);
   if(key&&!summary){choiceLabels(c,t);
   const rs=timeline.segments.find(s=>s.visual_cue.action==='reveal_scores'&&s.visual_cue.matrix_cell===key),lastReveal=rs.start+Math.max(...rs.visual_cue.score_reveals.map(event=>event.offset));if(t>=lastReveal)reveal(c,t,lastReveal,()=>{tx(c,'得分',100,739,30,400,C.muted);tx(c,`(${rs.visual_cue.scores[0]}, ${rs.visual_cue.scores[1]})`,208,744,52,700)});
   } else if(summary){tx(c,'两个人的选择',100,583,35,700);tx(c,'共同决定收益',100,646,35,700);}
  });
  group(c,beyond*(1-ramp(t,SEC('payoffs').end-.3,.25)),0,(1-beyond)*10,()=>{tx(c,'收益可以表示',100,418,37,700);[['省下的时间',519],['声誉',625],['对结果的偏好',731]].forEach(([a,y],i)=>{const pp=ramp(t,T('s33_beyond_money')+1.1+i*1.15,.4);group(c,pp,0,0,()=>{circle(c,124,y-12,17,C.paper,C.ink,2.5);if(i===0){line(c,124,y-12,124,y-23,C.ink,2);line(c,124,y-12,134,y-7,C.ink,2)}else if(i===1){line(c,116,y-11,122,y-5,C.ink,2);line(c,122,y-5,132,y-20,C.ink,2)}else{circle(c,124,y-12,6,C.ink,null)}tx(c,a,164,y,34,400)})})});
  reveal(c,t,T('s23_score_order'),()=>{tx(c,'数对顺序：',786,899,30,400,C.muted);tx(c,'（{{A}}得分，{{B}}得分）',958,899,32,700)});
 }
}
function recap(c,t){
 const p=ramp(t,SEC('recap').start,1.15);
 // The same complete matrix changes geometry, without old/new text crossfades.
 const x=mix(780,1190,p),y=mix(503,522,p),cw=mix(480,267,p),ch=mix(170,137,p);
 matrix(c,SEC('recap').start-.001,{geometry:{x,y,cw,ch},fontSize:mix(64,48,p)});
 badge(c,'A',mix(565,1035,p),mix(630,661,p),24);badge(c,'B',mix(1211,1409,p),mix(350,430,p),24);
 tx(c,'{{A}}',mix(565,1035,p),mix(699,723,p),30,700,C.ink,'center');tx(c,'{{B}}',mix(1263,1461,p),mix(361,441,p),30,700);
 const cardAlpha=1-ramp(p,.45,.3),wordAlpha=ramp(p,.98,.02);
 ['red','blue'].forEach((k,i)=>{card(c,k,mix(707,1136,p),mix(588+170*i,590.5+137*i,p),mix(82,70,p),{alpha:cardAlpha});card(c,k,mix(1020+480*i,1323.5+267*i,p),mix(426,462,p),73,{alpha:cardAlpha});
 group(c,wordAlpha,0,0,()=>{tx(c,k==='red'?'{{red}}':'{{blue}}',1136,602+137*i,31,700,C.ink,'center');tx(c,k==='red'?'{{red}}':'{{blue}}',1323.5+267*i,492,31,700,C.ink,'center')});});
 group(c,ramp(t,SEC('recap').start+1.1,.55),0,0,()=>{
  line(c,959,359,959,849,C.light,2);tx(c,'同一轮游戏',1448,381,31,400,C.muted,'center');
  tx(c,'（{{A}}得分，{{B}}得分）',1457,853,28,400,C.muted,'center');
  const rows=[['参与者','谁来决定？'],['信息','知道什么？'],['策略','怎么选择？'],['收益','各得什么？']];
  rows.forEach(([label,q],i)=>{const yy=451+i*103,at=i<2?T('s35_first_pair')+i*1.4:T('s36_second_pair')+(i-2)*1.4,active=ramp(t,at,.45);
   tx(c,'0'+(i+1),101,yy,31,700,C.muted);tx(c,label,188,yy,36,700);tx(c,q,430,yy,37,700);
   line(c,187,yy+23,821,yy+23,C.light,1);line(c,86,yy-32,86,yy+4,C.ink,4,active);
  });
 });
 reveal(c,t,T('s37_closing'),()=>tx(c,'先描述清楚，再分析选择。',960,905,38,700,C.ink,'center'));
}
export function drawFrame(canvas,t,{noSubtitles=false}={}){
 if(!Number.isFinite(t))throw Error('Frame time must be a finite number.');
 const scale=proposalScale(canvas.width,canvas.height);
 assertAssetsReady();
 t=t<0?0:t>=DURATION?lastFrameTime:t;resetRecords();setSceneTime(t,canvas);const c=canvas.getContext('2d');c.save();c.setTransform(scale,0,0,scale,0,0);c.fillStyle=C.paper;c.fillRect(0,0,W,H);c.lineJoin='round';c.lineCap='round';
 const sec=secAt(t);const scenes={intro,players,information,strategy,payoffs,recap};scenes[sec.id](c,t);finishActorLayers(canvas);chapter(c,t);if(!noSubtitles)subtitle(c,t);c.restore();return c;
}
