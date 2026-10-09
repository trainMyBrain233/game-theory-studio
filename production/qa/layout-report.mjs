import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertActorAlphaEvidence} from './layout-mode.mjs';

export function layoutPlanIdentity(sampling){
 return createHash('sha256').update(JSON.stringify({times:sampling.times,intervals:sampling.intervals,maxStep:sampling.maxStep,fps:sampling.fps})).digest('hex');
}
export function layoutShardTimes(sampling,index,count){
 assert(Number.isInteger(count)&&count>0&&Number.isInteger(index)&&index>=0&&index<count,'Invalid layout shard identity.');
 return sampling.times.filter((_,i)=>i%count===index);
}
/** Only combine complete, disjoint evidence for the exact parent plan. */
export function mergeLayoutReports(reports,{sampling,required}){
 const count=Math.ceil(sampling.times.length/100),planId=layoutPlanIdentity(sampling);
 assert.equal(reports.length,count,'Layout shard count mismatch.');
 const seen=new Set();
 for(const part of reports){
  const shard=part.shard;
  assert(shard&&!seen.has(shard.index),'Missing or duplicate layout shard identity.');seen.add(shard.index);
  assert.equal(shard.count,count,'Layout shard partition mismatch.');
  assert.equal(shard.plan_id,planId,'Layout sampling plan mismatch.');
  assert.deepEqual(part.sampling,{max_step_seconds:sampling.maxStep,fps:sampling.fps,transition_intervals:sampling.intervals},'Layout sampling metadata mismatch.');
  const times=layoutShardTimes(sampling,shard.index,count);
  assert.deepEqual(shard.sample_times,times,'Layout shard timestamp coverage mismatch.');
  assert.equal(part.samples,times.length,'Layout sample count mismatch.');
  for(const key of ['samples','text_draws','paths'])assert(Number.isSafeInteger(part[key])&&part[key]>=0,`Invalid layout ${key}.`);
  const alpha=part.actor_alpha;
  assert.equal(alpha?.mode,required?'private_actor_alpha':'public_placeholder','Layout alpha mode mismatch.');
  for(const key of ['inspected_mask_samples','nonempty_mask_samples','expected_actor_samples','clearance_checks'])assert(Number.isSafeInteger(alpha[key])&&alpha[key]>=0,`Invalid alpha ${key}.`);
  assert.equal(alpha.inspected_mask_samples,required?part.samples:0,'Missing per-frame alpha mask inspection.');
  assert(!alpha.clearance_checks||alpha.nonempty_mask_samples>0,'Alpha text checks require a nonempty mask.');
  assert(!alpha.expected_actor_samples||alpha.clearance_checks>0,'Expected actors require text checks.');
  assert(alpha.expected_actor_samples<=alpha.nonempty_mask_samples&&alpha.nonempty_mask_samples<=part.samples,'Invalid alpha mask coverage.');
  assert(alpha.clearance_checks<=part.text_draws,'Invalid alpha text-check coverage.');
  if(!required)assert.equal(alpha.nonempty_mask_samples+alpha.expected_actor_samples+alpha.clearance_checks,0,'Public QA cannot claim private alpha evidence.');
  assert.equal(part.status,part.issues.length?'needs_revision':'passed','Layout status disagrees with issues.');
 }
 const report={...reports[0],samples:0,text_draws:0,paths:0,main_text_min_size:Infinity,text_inventory:[],issues:[],actor_alpha:{...reports[0].actor_alpha,inspected_mask_samples:0,nonempty_mask_samples:0,expected_actor_samples:0,clearance_checks:0}};
 delete report.shard;
 for(const part of reports){for(const key of ['samples','text_draws','paths'])report[key]+=part[key];report.main_text_min_size=Math.min(report.main_text_min_size,part.main_text_min_size);report.text_inventory.push(...part.text_inventory);report.issues.push(...part.issues);for(const key of ['inspected_mask_samples','nonempty_mask_samples','expected_actor_samples','clearance_checks'])report.actor_alpha[key]+=part.actor_alpha[key];}
 assert.equal(report.samples,sampling.times.length,'Layout total sample coverage mismatch.');
 assertActorAlphaEvidence(report.actor_alpha,{required});
 report.sampling={...report.sampling,plan_id:planId};
 report.text_inventory=[...new Set(report.text_inventory)].sort();report.issues.sort((a,b)=>a.t-b.t);report.status=report.issues.length?'needs_revision':'passed';
 return report;
}
