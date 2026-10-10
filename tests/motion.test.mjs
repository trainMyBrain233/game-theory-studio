import test from 'node:test';
import assert from 'node:assert/strict';
import {clamp,ease,kinematicEase,mix,ramp,kinematicRamp,span,pulse,transformState,textTransitionState} from '../production/src/motion.mjs';

test('motion scalars retain both legacy floating-point evaluation orders',()=>{
 const oldClamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
 const oldGraphics=x=>{x=oldClamp(x);return x*x*x*(x*(x*6-15)+10)};
 const oldKinematic=x=>{x=oldClamp(x);return x*x*x*(10+x*(-15+6*x))};
 const points=[-Infinity,-1,-0,0,1,2,Infinity,NaN,...Array.from({length:10001},(_,i)=>i/10000)];
 for(const x of points){
  assert.equal(ease(x),oldGraphics(x),`graphics curve at ${x}`);
  assert.equal(kinematicEase(x),oldKinematic(x),`kinematic curve at ${x}`);
 }
});

test('clamping supports the rig inverse-kinematics interval and mix permits extrapolation',()=>{
 assert.equal(clamp(-2,-1,1),-1);assert.equal(clamp(2,-1,1),1);assert.equal(clamp(.5,-1,1),.5);
 assert.equal(mix(10,30,0),10);assert.equal(mix(10,30,1),30);assert.equal(mix(10,30,1.5),40);
});

test('graphics and kinematic ramps have explicit start, end and default duration',()=>{
 assert.equal(ramp(3,3),0);assert.equal(ramp(3.6,3),1);
 assert.equal(ramp(3.3,3),ease((3.3-3)/.6));
 assert.equal(kinematicRamp(3.3,3,.6),kinematicEase((3.3-3)/.6));
 assert.equal(ramp(2,3),0);assert.equal(kinematicRamp(4,3,.6),1);
});

test('window and pulse retain historical endpoint arithmetic without a hidden clock',()=>{
 assert.equal(span(1,2,4),0);assert.equal(span(3,2,4),1);
 assert.equal(span(4,2,4),ramp(4,2,.4)*(1-ramp(4,3.6,.4)));assert.ok(Math.abs(span(4,2,4))<1e-12);
 assert.equal(pulse(1,2,2),0);assert.equal(pulse(2,2,2),0);assert.equal(pulse(3,2,2),1);
 assert.equal(pulse(4,2,2),Math.sin(Math.PI)**2);assert.equal(pulse(5,2,2),0);
});

test('transform state preserves group visibility and alpha saturation',()=>{
 assert.deepEqual(transformState(-1,3,4),{visible:false,alpha:0,dx:3,dy:4});
 assert.deepEqual(transformState(2,3,4),{visible:true,alpha:1,dx:3,dy:4});
 assert.deepEqual(transformState(.5,-10,12),{visible:true,alpha:.5,dx:-10,dy:12});
});

test('default text transition reproduces reveal state, including its vertical direction',()=>{
 for(const t of [-1,0,.1375,.275,.4125,.55,1,Infinity]){
  const p=ramp(t,0,.55),state=textTransitionState(t,0);
  assert.equal(state.alpha,p);assert.equal(state.dx,0);assert.equal(state.dy,(1-p)*12);
  assert.equal(state.entered,p);assert.equal(state.exited,0);
 }
 assert(Object.is(textTransitionState(1,0,{dy:-12}).dy,-0),'retain the legacy signed-zero offset');
});

test('the same text transition supports independent entrances, reading holds and exits',()=>{
 for(const config of [
  {start:1,d:.6,dy:24,exitStart:3,exitDuration:.4,exitDy:-18},
  {start:.5,d:.4,dy:12,exitStart:2.5,exitDuration:.7,exitDy:20},
 ]){
  const {start,...options}=config;
  assert.equal(textTransitionState(start,start,options).alpha,0);
  assert.equal(textTransitionState(start+options.d,start,options).alpha,1);
  assert.equal(textTransitionState(options.exitStart,start,options).alpha,1);
  const middle=textTransitionState(options.exitStart+options.exitDuration/2,start,options);
  assert.ok(Math.abs(middle.alpha-.5)<1e-12);assert.ok(Math.abs(middle.dy-options.exitDy/2)<1e-12);
  const end=textTransitionState(options.exitStart+options.exitDuration,start,options);
  assert.ok(end.alpha<1e-12);assert.ok(Math.abs(end.dy-options.exitDy)<1e-12);
  const after=textTransitionState(options.exitStart+options.exitDuration+1/30,start,options);
  assert.equal(after.alpha,0);assert.equal(after.visible,false);assert.equal(after.dy,options.exitDy);
 }
});

test('text states repeat exactly when requested in an unrelated frame order',()=>{
 const options={d:.6,dy:24,exitStart:3,exitDuration:.4,exitDy:-18},times=[0,1,1.15,1.3,1.45,1.6,2,3,3.1,3.2,3.3,3.4,5];
 const expected=new Map(times.map(t=>[t,textTransitionState(t,1,options)]));
 for(const t of [...times].reverse().concat(times))assert.deepEqual(textTransitionState(t,1,options),expected.get(t));
});
