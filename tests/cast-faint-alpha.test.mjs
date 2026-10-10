// Exercise the real archived SVG rasterizer and clearance command in an isolated
// source copy: QA and mutations must never rewrite the authored archive.
import '../scripts/isolated-fonts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {withSourceFixture} from '../scripts/source-fixture.mjs';
import {pythonCommand} from '../scripts/python.mjs';

const relative='assets/characters/archive/proposals';
test('archived cast clearance counts every nonzero alpha, excluding transparent pixels',async()=>{
 // withSourceFixture is synchronous; keep all work inside its callback synchronous.
 // Rasterize independent probes first, using exactly the production SVG transform.
 const probes=[];
 for(const opacity of [0,0.1,1/255]){
  const shape=`<rect x="10" y="130" width="20" height="20" fill="#243E66" opacity="${opacity}"/>`;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 760">${shape}</svg>`;
  const canvas=createCanvas(1800,1280),context=canvas.getContext('2d');
  context.drawImage(await loadImage(Buffer.from(svg)),245,255,590,897);
  const alpha=context.getImageData(262,414,1,1).data[3];
  if(opacity===0)assert.equal(alpha,0);
  else assert(alpha>0&&alpha<30,`Expected a visible sub-30 alpha pixel, got ${alpha}`);
  probes.push({opacity,shape,alpha});
 }
 withSourceFixture(root=>{
  const script=path.join(root,relative,'check_clearance.mjs');
  const art=path.join(root,relative,'svg/human_A.svg');
  const source=fs.readFileSync(script,'utf8'),original=fs.readFileSync(art,'utf8');
  const run=()=>{
   const result=spawnSync(process.execPath,['--import',path.join(root,'scripts/isolated-fonts.mjs'),script],{
    cwd:root,encoding:'utf8',env:{...process.env,PYTHON:pythonCommand()},
   });
   assert.equal(result.error,undefined);
   // Parsing real output and asserting its content rules out unrelated font or
   // package failures being mistaken for the expected clearance rejection.
   assert.doesNotMatch(result.stderr,/FontTools|ModuleNotFoundError|Cannot find package/);
   const report=JSON.parse(result.stdout);
   assert.equal(report.svgFilesValidated,fs.readdirSync(path.join(root,relative,'svg')).filter(name=>name.endsWith('.svg')).length);
   assert.equal(report.labels.length,6);
   return {result,report};
  };
  const baseline=run();
  assert.equal(baseline.result.status,0,baseline.result.stderr+baseline.result.stdout);
  assert.equal(baseline.report.allPassed,true);
  for(const {opacity,shape,alpha} of probes){
   fs.writeFileSync(art,original.replace('</svg>',`${shape}</svg>`));
   const {result,report}=run();
   if(opacity===0){
    assert.equal(result.status,0,result.stderr+result.stdout);
    assert.deepEqual(report,baseline.report,'Fully transparent art must not affect clearance');
    continue;
   }
   assert.equal(result.status,1,result.stderr+result.stdout);
   assert.equal(report.allPassed,false);
   const label=report.labels.find(label=>label.proposal==='human'&&label.label==='A');
   assert.equal(label.pass,false);
   assert(label.minEuclideanClearancePixels<32,`Native alpha ${alpha} must violate 32px clearance`);
   assert(label.nearestArtPixel[0]>=256&&label.nearestArtPixel[0]<=282);
   assert(label.nearestArtPixel[1]>=407&&label.nearestArtPixel[1]<=433);
   assert(report.labels.filter(item=>item!==label).every(item=>item.pass));
   // Counterfactual: restore only the old alpha cutoff. The same real SVG must
   // pass, proving this regression catches the original implementation defect.
   const legacy=source.replace('if(data[(y*c.width+x)*4+3]===0)continue;', 'if(data[(y*c.width+x)*4+3]<30)continue;');
   assert.notEqual(legacy,source,'Legacy mutation must alter the actual pixel predicate');
   fs.writeFileSync(script,legacy);
   try{
    const old=run();
    assert.equal(old.result.status,0,old.result.stderr+old.result.stdout);
    assert.equal(old.report.allPassed,true);
   }finally{fs.writeFileSync(script,source);}
  }
 });
});
