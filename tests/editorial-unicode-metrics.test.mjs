import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {currentProducts,resolveDraft,template} from '../chapters/01-four-elements/editorial/zombie-kingdom-r2/build.mjs';
import {readableCount} from '../scripts/text-contract.mjs';
import {withSourceFixture} from '../scripts/source-fixture.mjs';
import {ROOT,pythonCommand} from '../scripts/python.mjs';

const relative='chapters/01-four-elements/editorial/zombie-kingdom-r2';
const draftName='第一集_语义块草稿_无音频时间码.json';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const sample='é𠀀\u{31350}١Ⅻ²e\u0301𝟜🙂，。'; // Eight L*/N* scalars, including three supplementary ones.

test('both editorial metrics count pinned Unicode letters and numbers once per scalar',()=>{
 const scene=read(path.join(ROOT,'design/scenes.json')),presentation=read(path.join(ROOT,'design/experiments/tabletop/presentation.json'));
 const timeline=read(path.join(ROOT,'chapters/01-four-elements/narration/timeline.json'));
 const baseline=JSON.parse(currentProducts()[draftName]);
 const source=timeline.segments[0],oldSource=source.voiceover;
 const oldBlocks=structuredClone(template.blocks),oldDraft=baseline.blocks[0].voiceover;
 // Replace introductory speech only. All case-specific cues and the current
 // names, selection and asymmetric payoffs remain untouched.
 try{
  source.voiceover=source.text=sample;source.lines=[sample];source.breath_points=[];
  template.blocks[0].voiceover=sample;
  const draft=JSON.parse(resolveDraft({scene,presentation,timeline,sourceHash:'unicode-metrics-fixture'})[draftName]);
  assert.equal(readableCount(sample),8);
  assert.equal(draft.metrics.old_spoken_character_count,baseline.metrics.old_spoken_character_count-readableCount(oldSource)+8);
  assert.equal(draft.metrics.draft_spoken_character_count,baseline.metrics.draft_spoken_character_count-readableCount(oldDraft)+8);
  assert.match(draft.metrics.definition,/Unicode 15\.0\.0/);
  assert.match(draft.metrics.definition,/逐码点/);
  assert.match(draft.metrics.definition,/不是真实语速|不是字素数、真实语速或片长预测/);
  assert(draft.blocks.every(block=>block.timing===null));
  assert.equal(draft.human_audio_available,false);
 }finally{template.blocks=oldBlocks;}
});

test('real narration and editorial rebuilds count accented and extended names and scalar numbers',()=>{
 withSourceFixture(root=>{
  const scenePath=path.join(root,'design/scenes.json'),scene=read(scenePath);
  scene.actors[0].label='é𠀀';scene.actors[1].label='e\u0301Ⅻ';
  scene.strategies[0].label='١²';scene.strategies[1].label='Ⅻ𝟜';
  fs.writeFileSync(scenePath,JSON.stringify(scene));
  const presentationPath=path.join(root,'design/experiments/tabletop/presentation.json'),presentation=read(presentationPath);
  presentation.actors.A.name='𠀀é';presentation.actors.B.name='Ⅻe\u0301';
  fs.writeFileSync(presentationPath,JSON.stringify(presentation));
  const templatePath=path.join(root,relative,'blocks.template.json'),source=read(templatePath);
  source.blocks[0].voiceover=sample;fs.writeFileSync(templatePath,JSON.stringify(source));
  for(const args of [['scripts/build-narration.mjs'],[`${relative}/build.mjs`],[`${relative}/build.mjs`,'--check']]){
   const run=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',env:{...process.env,PYTHON:pythonCommand()}});
   assert.equal(run.status,0,run.stderr);
  }
  const timeline=read(path.join(root,'chapters/01-four-elements/narration/timeline.json'));
  const draft=read(path.join(root,relative,draftName));
  const spoken=fs.readFileSync(path.join(root,relative,'第一集_提词器净稿_r2.txt'),'utf8');
  const oldText=timeline.segments.map(segment=>segment.voiceover).join('');
  assert(oldText.includes(scene.actors[0].label)&&oldText.includes(scene.actors[1].label));
  assert(spoken.includes(presentation.actors.A.name)&&spoken.includes(presentation.actors.B.name));
  assert.equal(draft.blocks[0].voiceover,sample);
  assert.equal(draft.metrics.old_spoken_character_count,readableCount(oldText));
  assert.equal(draft.metrics.draft_spoken_character_count,readableCount(spoken));
  // Independent regression witness: the previous BMP/ASCII-only regex must
  // undercount both generated texts, even when the surrounding case changes.
  const oldCount=text=>(text.match(/[\u4e00-\u9fffA-Za-z0-9]/g)||[]).length;
  assert(draft.metrics.old_spoken_character_count>oldCount(oldText));
  assert(draft.metrics.draft_spoken_character_count>oldCount(spoken));
 });
});
