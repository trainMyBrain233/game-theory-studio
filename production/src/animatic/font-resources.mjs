/** Read-only proof of the exact SC font resources used by a public animatic. */
import '../../../scripts/isolated-fonts.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {GlobalFonts} from '@napi-rs/canvas';
import {ROOT,pythonCommand} from '../../../scripts/python.mjs';

const DEFAULT_FONT_DIR=fileURLToPath(new URL('../../../typography/fonts',import.meta.url));
const VERIFIER=fileURLToPath(new URL('./font-resources.py',import.meta.url));
const SETUP=fileURLToPath(new URL('../../../scripts/setup_fonts.py',import.meta.url));
const WEIGHTS=['Regular','Bold'];
// These pins select dependencies only. Acceptance remains independently decided
// by setup_fonts.verify_cached(), whose current source bytes enter the proof key.
// As in --verify-only, canonical OTF bytes need no historical local TTC source.
const PINNED_SANS={
 Regular:'2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b',
 Bold:'b5f0d1a190a7f9b43c310a8850630af12553df32c4c050543f9059732d9b4c0a'
};
const proofs=new Map();
const proofDirectories=new WeakMap();
const registeredPairs=new Map();
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

// Re-read bytes, not mtime/size: replacement files can retain both metadata values.
// A bounded buffer avoids allocating entire CJK collections on every frame/cache hit.
function fileDigest(filename) {
 const descriptor=fs.openSync(filename,'r'),hasher=createHash('sha256'),buffer=Buffer.allocUnsafe(1024*1024);
 try {
  assert(fs.fstatSync(descriptor).isFile(),'Animatic font resource must be a regular file');
  let count;
  while((count=fs.readSync(descriptor,buffer,0,buffer.length,null))!==0)hasher.update(buffer.subarray(0,count));
  return hasher.digest('hex');
 } finally {fs.closeSync(descriptor);}
}

function snapshot(fontDir) {
 try {
  const manifestBytes=fs.readFileSync(path.join(fontDir,'prepared_font_manifest.json'));
  const manifest=JSON.parse(manifestBytes.toString('utf8'));
  assert(manifest && typeof manifest==='object' && !Array.isArray(manifest),'Prepared font manifest must be an object');
  const sources=new Map();
  const fonts=WEIGHTS.map(weight=>{
   const filename=`NotoSansCJKSC-${weight}.otf`,entry=manifest[filename];
   assert(entry && typeof entry==='object' && !Array.isArray(entry),`Prepared font manifest is missing ${filename}`);
   const result={weight,sha256:fileDigest(path.join(fontDir,filename))};
   if(entry.source_kind==='local_ttc_extraction' && result.sha256!==PINNED_SANS[weight]) {
    assert(typeof entry.source==='string' && path.extname(entry.source).toLowerCase()==='.ttc',`Original TTC source is required for ${filename}`);
    const source=path.resolve(ROOT,entry.source);
    if(!sources.has(source))sources.set(source,fileDigest(source));
    result.sourceSha256=sources.get(source);
   }
   return result;
  });
  const identity={version:'animatic-font-proof-v1',manifestSha256:digest(manifestBytes),fonts,
   verifierSha256:fileDigest(VERIFIER),setupSha256:fileDigest(SETUP)};
  return {identity,fingerprint:digest(JSON.stringify(identity))};
 } catch(error) {throw new Error(`Animatic font provenance failed: ${error.message}`,{cause:error});}
}

function prove(fontDir,current) {
 const result=spawnSync(pythonCommand(),[VERIFIER],{cwd:ROOT,encoding:'utf8',
  input:JSON.stringify({fontDir,expected:current.identity}),maxBuffer:4*1024*1024,
  env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},timeout:120000});
 if(result.error)throw new Error(`Animatic font provenance verification could not run: ${result.error.message}. Run npm run setup:python or set PYTHON.`,{cause:result.error});
 assert.equal(result.status,0,`Animatic font provenance failed: ${result.stderr.trim() || result.stdout.trim()}`);
 let verified;
 try {verified=JSON.parse(result.stdout);} catch(error) {throw new Error('Animatic font verifier returned invalid proof',{cause:error});}
 assert.equal(verified.manifestSha256,current.identity.manifestSha256,'Prepared font manifest changed during verification');
 assert.deepEqual(verified.fonts.map(({weight,sha256,sourceSha256})=>({weight,sha256,...(sourceSha256?{sourceSha256}:{})})),current.identity.fonts,'Font bytes or original TTC changed during verification');
 assert.equal(snapshot(fontDir).fingerprint,current.fingerprint,'Animatic font resources changed during verification');
 // Only independently checked successes enter the process cache; failures never do.
 proofs.set(current.fingerprint,verified);
 if(proofs.size>8)proofs.delete(proofs.keys().next().value);
 return verified;
}

function hasCodepoint(ranges,codepoint) {
 let left=0,right=ranges.length-1;
 while(left<=right) {
  const middle=(left+right)>>>1,[start,end]=ranges[middle];
  if(codepoint<start)right=middle-1;
  else if(codepoint>end)left=middle+1;
  else return true;
 }
 return false;
}

/**
 * Verify the current files against the pinned OTFs or independently reproduced
 * TTC faces, then check every input codepoint in both real Unicode cmaps.
 * No network, system-font search, prepared-cache changes or manifest rewriting
 * occurs. Independent TTC reproduction uses automatically removed temp files.
 *
 * Call before font registration. Keep assertUnchanged with the render session
 * and call it before drawing AND before returning a raster-cache hit. The proof
 * cache saves Python/fontTools work, never the current-byte checks. fontDir is
 * for verification of isolated prepared caches; it does not register a family.
 */
export function prepareVerifiedAnimaticFonts(texts,{fontDir=DEFAULT_FONT_DIR}={}) {
 assert(Array.isArray(texts) && texts.every(text=>typeof text==='string'),'Animatic font verification requires an array of displayed strings');
 const directory=path.resolve(fontDir),current=snapshot(directory);
 const verified=proofs.get(current.fingerprint) || prove(directory,current);
 const codepoints=new Set(texts.flatMap(text=>Array.from(text,char=>char.codePointAt(0))));
 for(const font of verified.fonts) {
  const missing=[...codepoints].filter(codepoint=>!hasCodepoint(font.cmapRanges,codepoint));
  assert.equal(missing.length,0,`Animatic text has unsupported glyphs in NotoSansCJKSC-${font.weight}.otf: ${missing.slice(0,8).map(codepoint=>`U+${codepoint.toString(16).toUpperCase().padStart(4,'0')}`).join(',')}${missing.length>8?' …':''}`);
 }
 const fonts=Object.freeze(verified.fonts.map(({weight,sha256})=>Object.freeze({weight,sha256})));
 const assertUnchanged=()=>assert.equal(snapshot(directory).fingerprint,current.fingerprint,'Animatic font resources changed after session creation; create a new verified session');
 const proof=Object.freeze({fingerprint:current.fingerprint,fonts,assertUnchanged});
 proofDirectories.set(proof,directory);
 return proof;
}

function assertRegisteredPair(family) {
 const styles=GlobalFonts.families.find(entry=>entry.family===family)?.styles || [];
 assert.deepEqual(styles.map(({weight,width,style})=>({weight,width,style})).sort((a,b)=>a.weight-b.weight),
  [400,700].map(weight=>({weight,width:'normal',style:'normal'})),
  'Animatic font registration ownership was lost: expected exactly the verified 400/700 faces');
}

function assertRegisteredBytes(record,family) {
 if(record.failure)throw record.failure;
 try {
  assertRegisteredPair(family);
  // Canvas 1.0.10 buffer registration deduplicates by complete byte comparison
  // after a content-hash lookup. Its FontKey IDs are reusable content IDs, NOT
  // native-instance liveness tokens. Require the exact two-style alias both
  // before and after probing the proven buffers: adding a missing proven face
  // beside an alien replacement must fail, never silently repair trust.
  // Do not remove/re-register on each frame: native rebuildAssets retains old
  // providers (up to 1000), retaining CJK-sized buffers on every renewal.
  // Reconstructing identical bytes is safe; IDs do not distinguish that from
  // continuous registration, and no such instance-ownership claim is made.
  for(const [index,bytes] of record.buffers.entries()) {
   const key=GlobalFonts.register(bytes,family);
   assert(key && key.typefaceId===record.ids[index],
    'Animatic font registration ownership was lost: verified byte identity changed');
  }
  assertRegisteredPair(family);
 } catch(error) {record.failure=error;throw error;}
}

/**
 * Register verified bytes under an identity-specific alias, independently of
 * typography/fonts.mjs's legacy process-wide alias. Pre-existing registration
 * of that old alias cannot make a new proof render with stale font bytes.
 */
export function registerVerifiedAnimaticFonts(proof) {
 const directory=proofDirectories.get(proof);
 assert(directory===DEFAULT_FONT_DIR,'Registration requires a current default-font proof from prepareVerifiedAnimaticFonts');
 proof.assertUnchanged();
 const identity=digest(JSON.stringify(proof.fonts)),family=`GameTheory Noto Sans SC Animatic ${identity}`;
 if(!registeredPairs.has(identity)) {
  assert(!GlobalFonts.has(family),'Animatic font alias was registered without a matching byte proof');
  const buffers=proof.fonts.map(({weight,sha256})=>{
   const bytes=fs.readFileSync(path.join(directory,`NotoSansCJKSC-${weight}.otf`));
   assert.equal(digest(bytes),sha256,'Animatic font bytes changed before registration');
   return bytes;
  });
  const keys=[];
  try {
   for(const bytes of buffers) {
    const key=GlobalFonts.register(bytes,family);
    assert(key,'Verified animatic font registration failed');keys.push(key);
   }
   assertRegisteredPair(family);proof.assertUnchanged();
   registeredPairs.set(identity,{keys,buffers,ids:keys.map(key=>key.typefaceId),failure:null});
  } catch(error) {if(keys.length)GlobalFonts.removeBatch(keys);throw error;}
 }
 const record=registeredPairs.get(identity);
 const assertUnchanged=()=>{proof.assertUnchanged();assertRegisteredBytes(record,family);};
 assertUnchanged();
 return Object.freeze({...proof,family,assertUnchanged});
}
