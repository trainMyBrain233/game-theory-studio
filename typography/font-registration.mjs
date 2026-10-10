/** Native ownership policy, separated so its failures can be tested without Canvas. */
import assert from 'node:assert/strict';

export function createFontRegistration(GlobalFonts,verify) {
 const owned=new Map(),loaded=new Set();
 function register(entries) {
  for(const [,family] of entries)loaded.delete(family);
  for(const [,family] of entries) {
   assert(owned.has(family) || !GlobalFonts.has(family),`Unowned SC font alias is already registered: ${family}`);
  }
  const proof=verify(entries.map(([kind])=>kind));
  // Existing contexts can retain native typefaces. Never switch their bytes
  // under the fixed public alias; start a fresh rendering process instead.
  for(const [kind,family] of entries) {
   const previous=owned.get(family),fonts=proof.fonts.filter(font=>font.kind===kind);
   assert(!previous || JSON.stringify(previous.hashes)===JSON.stringify(fonts.map(font=>font.sha256)),
    'SC font bytes changed after registration; restart the rendering process');
  }
  // Canvas 1.0.10 exposes no FontKey liveness/alias lookup. Remove only our
  // opaque keys and require an empty alias before renewal. A matching 400/700
  // style list cannot establish ownership after another caller alters it.
  for(const [,family] of entries) {
   const previous=owned.get(family);
   if(previous) {
    owned.delete(family);
    const removed=GlobalFonts.removeBatch(previous.keys);
    assert.equal(removed,previous.keys.length,`SC font registration ownership was lost: ${family}`);
   }
   assert(!GlobalFonts.has(family),`Unowned SC font alias is already registered: ${family}`);
  }
  const pending=new Map();
  try {
   for(const [kind,family] of entries) {
    const fonts=proof.fonts.filter(font=>font.kind===kind),record={keys:[],hashes:fonts.map(font=>font.sha256)};
    pending.set(family,record);
    for(const font of fonts) {
     const key=GlobalFonts.register(font.bytes,family);
     assert(key,`SC font registration failed: Noto${kind}CJKSC-${font.weight}.otf`);
     record.keys.push(key);
    }
    const weights=GlobalFonts.families.find(entry=>entry.family===family)?.styles.map(style=>style.weight) || [];
    assert([400,700].every(weight=>weights.includes(weight)),`Expected real 400/700 weights in ${family}`);
   }
   proof.assertUnchanged();
   for(const [family,record] of pending){owned.set(family,record);loaded.add(family);}
  } catch(error) {
   const keys=[...pending.values()].flatMap(record=>record.keys);
   if(keys.length)GlobalFonts.removeBatch(keys);
   throw error;
  }
 }
 return {register,isLoaded:family=>loaded.has(family)};
}
