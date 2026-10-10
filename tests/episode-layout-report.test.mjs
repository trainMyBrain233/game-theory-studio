import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutPlanIdentity,layoutShardTimes,mergeLayoutReports} from '../production/qa/layout-report.mjs';
import {createActorAlphaAudit} from '../production/qa/layout-mode.mjs';
const sampling={times:Array.from({length:201},(_,i)=>i/10),intervals:[],maxStep:.1,fps:30};
function reports(){return [0,1,2].map(index=>{
 const times=layoutShardTimes(sampling,index,3),active=index===0;
 return {shard:{index,count:3,plan_id:layoutPlanIdentity(sampling),sample_times:times},samples:times.length,text_draws:times.length,paths:0,main_text_min_size:40,text_inventory:['fixture'],issues:[],status:'passed',sampling:{max_step_seconds:.1,fps:30,transition_intervals:[]},actor_alpha:{mode:'private_actor_alpha',inspected_mask_samples:times.length,nonempty_mask_samples:active?1:0,expected_actor_samples:active?1:0,clearance_checks:active?1:0}};
});}
const merge=parts=>mergeLayoutReports(parts,{sampling,required:true});
test('complete alpha audit accepts verified partitions without actors only when full evidence exists',()=>{
 const result=merge(reports());assert.equal(result.samples,201);assert.equal(result.actor_alpha.nonempty_mask_samples,1);assert.equal(result.actor_alpha.clearance_checks,1);
 assert.equal(result.sampling.plan_id,layoutPlanIdentity(sampling));assert(!('shard' in result));
});
for(const [name,mutate,pattern] of [
 ['missing shard',p=>p.pop(),/shard count/],
 ['duplicated shard',p=>p[2]=structuredClone(p[0]),/duplicate/],
 ['wrong partition',p=>p[0].shard.count=2,/partition/],
 ['same-count shifted timeline',p=>p[0].shard.plan_id=layoutPlanIdentity({...sampling,times:sampling.times.map(t=>t+.001)}),/plan mismatch/],
 ['same-count shifted timestamp',p=>p[0].shard.sample_times[1]+=.001,/timestamp coverage/],
 ['duplicate timestamp',p=>p[0].shard.sample_times[1]=p[0].shard.sample_times[0],/timestamp coverage/],
 ['missing sample',p=>p[0].samples--,/sample count/],
 ['mode downgrade',p=>p[0].actor_alpha.mode='public_placeholder',/mode mismatch/],
 ['false expected mask',p=>p[1].actor_alpha.expected_actor_samples=1,/Expected actors|mask coverage/],
 ['missing per-frame mask check',p=>p[0].actor_alpha.inspected_mask_samples--,/per-frame alpha/],
 ['invented checks on empty masks',p=>p[1].actor_alpha.clearance_checks=1,/require a nonempty mask/],
 ['wrong sampling metadata',p=>p[0].sampling.fps=60,/sampling metadata/],
 ['invented checks',p=>p[0].actor_alpha.clearance_checks=1000,/text-check coverage/],
 ['missing all nonempty masks',p=>{for(const r of p)r.actor_alpha={mode:'private_actor_alpha',inspected_mask_samples:r.samples,nonempty_mask_samples:0,expected_actor_samples:0,clearance_checks:0};},/did not perform/],
 ['no actual text checks',p=>{p[0].actor_alpha.clearance_checks=0;p[0].actor_alpha.expected_actor_samples=0;},/did not perform/],
])test(`aggregation rejects ${name}`,()=>{const parts=reports();mutate(parts);assert.throws(()=>merge(parts),pattern);});
const mask=alpha=>({width:1,height:1,getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray([0,0,0,alpha])})})});
test('partial evidence never relaxes per-frame required masks or missing checks',()=>{
 const empty=createActorAlphaAudit({required:true,width:1,height:1});
 empty.inspect(mask(0),{expected:false,t:0});assert.equal(empty.finish({partial:true}).clearance_checks,0);assert.throws(()=>empty.finish(),/did not perform/);
 const missing=createActorAlphaAudit({required:true,width:1,height:1});assert.throws(()=>missing.inspect(null,{expected:false,t:0}),/requires a real/);
 const expected=createActorAlphaAudit({required:true,width:1,height:1});assert.throws(()=>expected.inspect(mask(0),{expected:true,t:0}),/expected visible artwork/);
 const unchecked=createActorAlphaAudit({required:true,width:1,height:1});unchecked.inspect(mask(255),{expected:true,t:0});assert.throws(()=>unchecked.finish({partial:true}),/expected-actor frame/);
});
test('public aggregate cannot manufacture private alpha evidence',()=>{
 const parts=reports();for(const p of parts){p.actor_alpha.mode='public_placeholder';p.actor_alpha.inspected_mask_samples=0;}
 assert.throws(()=>mergeLayoutReports(parts,{sampling,required:false}),/cannot claim private/);
});
