import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {withSourceFixture} from '../scripts/source-fixture.mjs';
import {pythonCommand} from '../scripts/python.mjs';
import {interactionSchedule,flatRegressionWindow,tabletopState} from '../design/experiments/tabletop/layout.mjs';

test('real two- and four-character narration rebuilds drive pickup samples and flat regression clips',()=>{
 withSourceFixture(root=>{
  const file=path.join(root,'design/scenes.json'),scene=JSON.parse(fs.readFileSync(file,'utf8')),schedules=[];
  for(const names of [['明月','青禾'],['明月清风','青禾山川']]){
   scene.actors.forEach((actor,i)=>actor.label=names[i]);fs.writeFileSync(file,JSON.stringify(scene));
   const build=spawnSync(process.execPath,['scripts/build-narration.mjs'],{cwd:root,encoding:'utf8',env:{...process.env,PYTHON:pythonCommand()}});assert.equal(build.status,0,build.stdout+build.stderr);
   const timeline=JSON.parse(fs.readFileSync(path.join(root,'chapters/01-four-elements/narration/timeline.json'),'utf8')),schedule=interactionSchedule(timeline),clip=flatRegressionWindow(timeline);schedules.push(schedule);
   const anchor=timeline.segments.find(s=>s.id==='s08_known_unknown').start;
   assert.equal(schedule.reachEnd,anchor+1.75);assert.equal(clip.start,anchor+1.6);assert.equal(clip.frames,clip.duration*clip.fps);
   const samples=Array.from({length:clip.frames},(_,i)=>tabletopState('flat-rest',clip.start+i/clip.fps,{scene,timeline}));
   assert.ok(samples.some(s=>s.phase==='reach'));assert.ok(samples.some(s=>s.cards.some(c=>!c.chosen&&c.alpha>.1&&c.alpha<.9)&&s.cards.some(c=>c.chosen&&c.flat<1)));
   assert.ok(samples.every(s=>s.cards.filter(c=>!c.chosen).every(c=>c.flat===1&&c.bottom===846)));
   const result=spawnSync(process.execPath,['--test','tests/tabletop-prototype.test.mjs'],{cwd:root,encoding:'utf8',env:{...process.env,PYTHON:pythonCommand()}});assert.equal(result.status,0,result.stdout+result.stderr);
  }
  assert.notEqual(schedules[0].reachEnd,schedules[1].reachEnd,'The variant must actually rebuild a different pickup anchor.');
  const timeline=JSON.parse(fs.readFileSync(path.join(root,'chapters/01-four-elements/narration/timeline.json'),'utf8'));
  const stale=tabletopState('flat-rest',36.7,{scene,timeline});assert.ok(!stale.cards.some(c=>!c.chosen&&c.alpha>.1&&c.alpha<.9),'Negative control: the former fixed 36.7s is not a valid partial-fade sample after the four-character rebuild.');
 });
});

test('flat clip regression rejects a stale hardcoded start even if duration and frame count remain valid',()=>{
 const timeline={segments:[{id:'s08_known_unknown',start:52},{id:'s09_simultaneous',start:59}]};
 const clip=flatRegressionWindow(timeline);assert.equal(clip.start,53.6);assert.notEqual(clip.start,36.2);
});
