/** Public QA is the default; private alpha QA must never use placeholder art. */
const layoutFlags=new Set(['--actor-alpha','--placeholder-cast','--stress-cast','--all-frames']);
export function layoutMode(args){
 // These switches take no values. Never turn a typo, positional argument or
 // renderer-only option into a successful public-placeholder QA run.
 for(const arg of args)if(!layoutFlags.has(arg))throw Error(`Unknown layout argument: ${JSON.stringify(arg)}. Supported switches (no values): ${[...layoutFlags].join(', ')}.`);
 const actorAlpha=args.includes('--actor-alpha'),placeholder=args.includes('--placeholder-cast');
 if(actorAlpha&&placeholder)throw Error('--actor-alpha conflicts with --placeholder-cast; private alpha QA requires the real layered renderer.');
 return {actorAlpha,placeholder:!actorAlpha};
}

/** These scene interiors always retain at least actor A. Skip fades and
 * matrix/recap-only sections; strategy deliberately moves B offscreen. */
export function expectsActorPixels(t,timeline){
 return timeline.sections.some(s=>['intro','players','information','strategy'].includes(s.id)&&t>=s.start+(s.id==='intro'?1.5:.5)&&t<s.end-.5);
}

/** The existence requirement belongs to the complete run, not each partition. */
export function assertActorAlphaEvidence(summary,{required}){
 if(required&&(!summary.nonempty_mask_samples||!summary.clearance_checks))throw Error('Actor alpha QA did not perform any text clearance checks against nonempty artwork masks.');
}

/** Fail closed when an explicitly requested mask check did not inspect artwork. */
export function createActorAlphaAudit({required,width,height}){
 let inspectedSamples=0,nonemptySamples=0,expectedSamples=0,checks=0,currentNonempty=false,currentExpected=false,currentChecks=0;
 const assertFrameChecks=()=>{if(required&&currentExpected&&!currentChecks)throw Error('Actor alpha QA did not perform text clearance checks on an expected-actor frame.');};
 return {
  inspect(mask,{expected=false,t}={}){
   assertFrameChecks();currentExpected=expected;currentChecks=0;
   currentNonempty=false;
   if(!required)return;
   if(!mask||mask.width!==width||mask.height!==height||typeof mask.getContext!=='function')throw Error('Actor alpha QA requires a real canvas-sized RGBA mask on every sampled frame.');
   const data=mask.getContext('2d').getImageData(0,0,width,height).data;
   if(data.length!==width*height*4)throw Error('Actor alpha QA received an invalid RGBA mask.');
   inspectedSamples++;
   for(let i=3;i<data.length;i+=4)if(data[i]>0){currentNonempty=true;nonemptySamples++;break;}
   if(expected){expectedSamples++;if(!currentNonempty)throw Error(`Actor alpha QA expected visible artwork at t=${t}, but its mask is empty.`);}
  },
  checked(){if(required&&currentNonempty){checks++;currentChecks++;}},
  finish({partial=false}={}){
   assertFrameChecks();
   const summary={mode:required?'private_actor_alpha':'public_placeholder',inspected_mask_samples:inspectedSamples,nonempty_mask_samples:nonemptySamples,expected_actor_samples:expectedSamples,clearance_checks:checks};
   if(!partial)assertActorAlphaEvidence(summary,{required});
   return summary;
  }
 };
}
