import test from 'node:test';
import assert from 'node:assert/strict';
import {createCardElement} from '../production/src/elements/card.mjs';

function fixture(){
 const calls=[],ctx={globalAlpha:1,save(){calls.push(['save'])},restore(){calls.push(['restore'])},translate(...a){calls.push(['translate',...a])},rotate(...a){calls.push(['rotate',...a])},scale(...a){calls.push(['scale',...a])},drawImage(...a){calls.push(['image',...a])}};
 const element=createCardElement({assets:{'card-red':'red-fixture','card-blue':'blue-fixture'},palette:{paper:'white',ink:'navy',white:'white'},strategies:{red:{label:'合作'},blue:{label:'退出'}},drawing:{tx:(_,...a)=>calls.push(['text',...a]),round:(_,...a)=>calls.push(['round',...a])},labelContract:{sourceViewBox:[0,0,140,190],anchor:[70,130],style:{fontSize:44,fontWeight:700,fill:'white',align:'center',baseline:'middle'}}});
 return {calls,ctx,element};
}
test('card element reuses injected strategy text, resources and geometry in two scenes',()=>{
 const {calls,ctx,element}=fixture();
 for(const [kind,width] of [['red',105],['blue',73]]){
  calls.length=0;const result=element.draw(ctx,{kind,x:100,y:200,width,angle:.035});
  assert.deepEqual(calls.slice(0,4),[['save'],['translate',100,200],['rotate',.035],['scale',1,1]]);
  assert.equal(calls.find(c=>c[0]==='image')[1],`${kind}-fixture`);
  const text=calls.find(c=>c[0]==='text');assert.equal(text[1],kind==='red'?'合作':'退出');assert.equal(text[3],35*width/140);assert.equal(text[4],44*width/140);assert.equal(text[5],700);assert.deepEqual(text.at(-1),{record:false,baseline:'middle'});
  assert.equal(result.metadata.attachment.gripXFraction,.4);
 }
});
test('card flip changes its face at the midpoint and keeps a nonzero drawn edge',()=>{
 const {calls,ctx,element}=fixture();
 for(const [progress,kind] of [[0,'red'],[.25,'red'],[.5,'blue'],[1,'blue']]){
  calls.length=0;const result=element.drawFlip(ctx,{from:'red',to:'blue',progress,x:0,y:0});
  assert.equal(calls.find(c=>c[0]==='image')[1],`${kind}-fixture`);
  assert.equal(result.transform.visibleScaleX,Math.max(Math.abs(Math.cos(Math.PI*progress)),.012));
 }
});
test('card back fallback has no misleading strategy label',()=>{
 const {calls,ctx,element}=fixture();element.draw(ctx,{kind:'back',x:0,y:0,alpha:.5});
 assert.ok(calls.some(c=>c[0]==='round'));assert.ok(!calls.some(c=>c[0]==='text'));assert.equal(ctx.globalAlpha,.5);
});
