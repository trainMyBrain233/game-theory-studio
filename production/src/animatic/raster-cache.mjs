/** A bounded cache belongs to exactly one captured render session. */
import assert from 'node:assert/strict';
export function createRasterCache(session,{maxEntries=8}={}) {
 assert(session && Object.isFrozen(session) && /^[a-f0-9]{64}$/.test(session.fingerprint),'A captured immutable render session is required');
 assert(typeof session.renderPNG==='function' && typeof session.assertResourcesUnchanged==='function' && Number.isSafeInteger(session.durationFrames) && session.durationFrames>0,'Invalid render session');
 assert(Number.isSafeInteger(maxEntries) && maxEntries>=1 && maxEntries<=1024,'maxEntries must be 1..1024');
 const entries=new Map();let hits=0,misses=0;
 const get=frame=>{
  assert(Number.isSafeInteger(frame) && frame>=0 && frame<session.durationFrames,'Frame outside cache session');
  session.assertResourcesUnchanged();
  if(entries.has(frame)){hits++;const bytes=entries.get(frame);entries.delete(frame);entries.set(frame,bytes);return Buffer.from(bytes);}
  misses++;const rendered=session.renderPNG(frame);assert(Buffer.isBuffer(rendered),'renderPNG must return a Buffer');
  // Snapshot both on entry and return: callers cannot poison later cache hits.
  const captured=Buffer.from(rendered);entries.set(frame,captured);
  if(entries.size>maxEntries)entries.delete(entries.keys().next().value);
  return Buffer.from(captured);
 };
 return Object.freeze({fingerprint:session.fingerprint,get,clear:()=>entries.clear(),stats:()=>Object.freeze({hits,misses,size:entries.size})});
}
