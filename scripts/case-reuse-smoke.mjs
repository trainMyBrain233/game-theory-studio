import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {withSourceFixture} from './source-fixture.mjs';
import {pythonCommand} from './python.mjs';

withSourceFixture(root=>{
 // Core tests may create another source fixture. Give this temporary copy a
 // local source index; no remotes, identity, commits or credentials are needed.
 const init=spawnSync('git',['init','--quiet'],{cwd:root,encoding:'utf8'});assert.equal(init.status,0,init.stderr);
 fs.appendFileSync(path.join(root,'.git/info/exclude'),'\n/node_modules\n/typography/fonts\n/.venv\n');
 const index=spawnSync('git',['add','--all'],{cwd:root,encoding:'utf8'});assert.equal(index.status,0,index.stderr);
 const file=path.join(root,'design/scenes.json'),scene=JSON.parse(fs.readFileSync(file,'utf8'));
 scene.actors[0].label='明月';scene.actors[1].label='青禾';
 scene.strategies[0].label='合作';scene.strategies[1].label='退出';
 scene.payoffs=[[[11,12],[21,22]],[[31,32],[41,42]]];
 scene.selected={row:1,column:0,actorA:'blue',actorB:'red'};
 fs.writeFileSync(file,JSON.stringify(scene));
 // Run the real user commands, without recursively invoking this fixture.
 for(const command of ['build:narration','build:editorial','qa:data','qa:editorial','test:core','render:proposals','qa:design','qa:layout','qa:cast']){
  const run=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run',command],{cwd:root,encoding:'utf8',env:{...process.env,PYTHON:pythonCommand()},maxBuffer:8*1024*1024});
  assert.equal(run.status,0,`Changed supported case failed ${command}:\n${run.stdout}\n${run.stderr}`);
 }
 const base=path.join(root,'chapters/01-four-elements/narration');
 const timeline=JSON.parse(fs.readFileSync(path.join(base,'timeline.json'),'utf8'));
 const guidance=JSON.stringify(timeline.speech_guidance);
 assert(!/小A|小B|[（(]0[，,]5/.test(guidance),'Speech guidance retains old names or payoff example');
 const voiceover=fs.readFileSync(path.join(base,'voiceover_v2_zh.txt'),'utf8');
 assert(!voiceover.includes('把A、B读成英语字母名称'),'Chinese display names retain an English-letter reading instruction');
 assert(voiceover.includes('明月得三十一分，青禾得三十二分。'));
 const design=JSON.parse(fs.readFileSync(path.join(root,'design/qa/checks.json'),'utf8'));
 assert.equal(design.failed,0);assert.equal(design.passed,53);
 console.log('Case reuse: changed Chinese names, strategies, asymmetric payoffs and default BR pass rebuild, data, core, all 53 design checks, layout and read-only cast QA; recording guidance is reusable.');
});
