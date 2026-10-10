import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {contrastRatio,assertTextContrast,proposalTextPairs,productionTextPairs} from '../design/text-contrast.mjs';
import {productionPalette} from '../production/src/palette.mjs';
const tokens=JSON.parse(fs.readFileSync(new URL('../design/tokens.json',import.meta.url)));
test('contrast uses unrounded sRGB ratios and rejects malformed colors',()=>{
 assert.equal(contrastRatio('#000000','#FFFFFF'),21);assert.equal(contrastRatio('#243E66','#243E66'),1);
 for(const color of ['red','#fff','#12345678','#GGGGGG'])assert.throws(()=>contrastRatio(color,'#FFFFFF'),/opaque/);
});
test('default meaningful proposal and production pairs pass, including the large editorial score exception',()=>{
 for(const id of Object.keys(tokens.styles))assertTextContrast(proposalTextPairs(tokens,id));
 const selected=proposalTextPairs(tokens,'editorial').find(p=>p.role.startsWith('selected'));
 assert.equal(selected.minimum,3);assert.ok(contrastRatio(selected.foreground,selected.background)<4.5);
 const colors=productionPalette(tokens);assert.equal(colors.focus_fill,tokens.styles.textbook.wash);
 assertTextContrast(productionTextPairs(colors));
});
test('all actual proposal role pairs reject same-color and near-color mutations',()=>{
 for(const id of Object.keys(tokens.styles)){
  const mutations=[s=>s.styles[id].wash=id==='editorial'?s.styles[id].accent:s.styles[id].ink,
   s=>s.styles[id].wash=id==='editorial'?'#C04030':'#303C50',s=>s.styles[id].muted=s.styles[id].paper,
   s=>s.styles[id].ink=s.styles[id].paper,s=>s.semantic.strategyRed.fill='#FFFFFF',s=>s.semantic.strategyBlue.fill='#EEEEEE'];
  if(id==='editorial')mutations.push(s=>s.styles[id].accent=s.styles[id].paper);
  if(id==='bright')mutations.push(s=>s.styles[id].accent=s.styles[id].ink);
  for(const mutate of mutations){const copy=structuredClone(tokens);mutate(copy);assert.throws(()=>assertTextContrast(proposalTextPairs(copy,id)),/Text contrast/,id);}
 }
});
test('production adapter rejects actual focus, badge and card color mutations',()=>{
 for(const mutate of [s=>s.styles.textbook.wash=s.styles.textbook.ink,s=>s.styles.textbook.wash='#354A68',
  s=>s.styles.textbook.muted='#777777',s=>s.semantic.strategyRed.fill='#FFFFFF',s=>s.semantic.strategyBlue.fill='#EEEEEE']){
  const copy=structuredClone(tokens);mutate(copy);assert.throws(()=>productionPalette(copy),/Text contrast/);
 }
 const colors=productionPalette(tokens);assert.throws(()=>assertTextContrast(productionTextPairs(colors,colors.red_strategy)),/card label\/red_strategy/);
});
test('real proposal consumer rejects invalid pairs before any draw and production model rejects mapped wash',()=>{
 const source=`
  import assert from 'node:assert/strict';import fs from 'node:fs';
  import {TOKENS,drawScene} from ${JSON.stringify(new URL('../design/render-proposals.mjs',import.meta.url).href)};
  for(const id of ['editorial','textbook','bright'])for(const color of [id==='editorial'?TOKENS.styles[id].accent:TOKENS.styles[id].ink,'#555555']){
   const previous=TOKENS.styles[id].wash;TOKENS.styles[id].wash=color;
   try{assert.throws(()=>drawScene({width:1920,height:1080,getContext(){return {}}},id,'payoff'),/Text contrast/);}finally{TOKENS.styles[id].wash=previous;}
  }
  const read=fs.readFileSync;fs.readFileSync=function(file,...args){const value=read.call(this,file,...args);if(String(file).endsWith('/design/tokens.json')){const data=JSON.parse(value);data.styles.textbook.wash=data.styles.textbook.ink;return JSON.stringify(data);}return value;};
  await assert.rejects(import(${JSON.stringify(new URL('../production/src/model.mjs',import.meta.url).href)}),/ink\\/focus_fill.*1.000:1/);
 `;
 const result=spawnSync(process.execPath,['--loader',new URL('./fixtures/proposal-header-stubs-loader.mjs',import.meta.url).pathname,'--input-type=module','-e',source],{encoding:'utf8',timeout:30000});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
