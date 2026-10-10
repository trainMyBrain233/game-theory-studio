/** Read-only, byte-keyed proof at the registration boundary, never per frame. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {currentGlyphInventory} from './glyph-inventory.mjs';
import {runPython} from '../scripts/python.mjs';

const DIRECTORY=fileURLToPath(new URL('./fonts',import.meta.url));
const VERIFIER=fileURLToPath(new URL('./verify-fonts.py',import.meta.url));
const SETUP=fileURLToPath(new URL('../scripts/setup_fonts.py',import.meta.url));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const proofs=new Map();

function fileDigest(filename) {
 const descriptor=fs.openSync(filename,'r'),hasher=createHash('sha256'),buffer=Buffer.allocUnsafe(1024*1024);
 try {
  assert(fs.fstatSync(descriptor).isFile(),'SC font resource must be a regular file');
  let count;
  while((count=fs.readSync(descriptor,buffer,0,buffer.length,null))!==0)hasher.update(buffer.subarray(0,count));
  return hasher.digest('hex');
 } finally {fs.closeSync(descriptor);}
}

function snapshot(kinds) {
 const fonts=kinds.flatMap(kind=>['Regular','Bold'].map(weight=>{
  const filename=path.join(DIRECTORY,`Noto${kind}CJKSC-${weight}.otf`);
  if(!fs.existsSync(filename))throw new Error(`Required SC font is missing: ${filename}`);
  return {kind,weight,sha256:fileDigest(filename)};
 }));
 return {fonts,inventory:currentGlyphInventory(),manifestSha256:fileDigest(path.join(DIRECTORY,'prepared_font_manifest.json')),
  verifierSha256:fileDigest(VERIFIER),setupSha256:fileDigest(SETUP)};
}

function sourcesUnchanged(sources) {
 try {return Object.entries(sources).every(([filename,sha256])=>fileDigest(filename)===sha256);}
 catch {return false;}
}

export function verifyPreparedFonts(kinds) {
 const current=snapshot(kinds),fingerprint=digest(JSON.stringify(current));
 let proof=proofs.get(fingerprint);
 if(!proof || !sourcesUnchanged(proof.sources)) {
  // Never call preparation, discovery or download paths from a renderer.
  const result=runPython([VERIFIER],{stdio:'pipe',encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024,
   input:JSON.stringify({fontDir:DIRECTORY,expected:current}),env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  assert.equal(result.status,0,`SC font provenance failed: ${result.stderr?.trim() || result.stdout?.trim() || result.signal}`);
  proof=JSON.parse(result.stdout);
  assert.deepEqual(proof.expected,current,'SC font verifier returned a different byte proof');
  assert(proof.sources && typeof proof.sources==='object' && !Array.isArray(proof.sources),'SC font verifier returned invalid source provenance');
  assert(sourcesUnchanged(proof.sources),'Original TTC source changed during verification');
  assert.deepEqual(snapshot(kinds),current,'SC font resources changed during verification');
  proofs.set(fingerprint,proof);
  if(proofs.size>4)proofs.delete(proofs.keys().next().value);
 }
 const assertUnchanged=()=>{
  assert.deepEqual(snapshot(kinds),current,'SC font resources changed during registration');
  assert(sourcesUnchanged(proof.sources),'Original TTC source changed during registration');
 };
 // Register these exact verified buffers, never reopen a path inside Canvas.
 const fonts=current.fonts.map(font=>{
  const bytes=fs.readFileSync(path.join(DIRECTORY,`Noto${font.kind}CJKSC-${font.weight}.otf`));
  assert.equal(digest(bytes),font.sha256,'SC font bytes changed before registration');
  return {...font,bytes};
 });
 assertUnchanged();
 return {fonts,assertUnchanged};
}
