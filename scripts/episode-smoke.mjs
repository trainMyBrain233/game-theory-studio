import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {ROOT,pythonCommand} from './python.mjs';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'studio-episode-'));
try{
 const list=spawnSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:ROOT});
 assert.equal(list.status,0);
 for(const relative of new Set(list.stdout.toString('utf8').split('\0').filter(Boolean))){
  const source=path.join(ROOT,relative);if(!fs.existsSync(source))continue;
  fs.mkdirSync(path.dirname(path.join(temp,relative)),{recursive:true});fs.copyFileSync(source,path.join(temp,relative));
 }
 fs.symlinkSync(path.join(ROOT,'node_modules'),path.join(temp,'node_modules'),'dir');
 fs.symlinkSync(path.join(ROOT,'typography/fonts'),path.join(temp,'typography/fonts'),'dir');
 const scenes=JSON.parse(fs.readFileSync(path.join(temp,'design/scenes.json'),'utf8'));
 scenes.actors[0].label='甲';scenes.actors[1].label='乙';scenes.strategies[0].label='合作';scenes.strategies[1].label='退出';
 scenes.payoffs=[[[11,12],[21,22]],[[31,32],[41,42]]];scenes.selected={row:1,column:0,actorA:'blue',actorB:'red'};
 fs.writeFileSync(path.join(temp,'design/scenes.json'),JSON.stringify(scenes));
 const tokens=JSON.parse(fs.readFileSync(path.join(temp,'design/tokens.json'),'utf8'));
 tokens.canvas.subtitleFont=48;tokens.styles.textbook.titleFamily='serif';
 fs.writeFileSync(path.join(temp,'design/tokens.json'),JSON.stringify(tokens));
 const build=spawnSync(pythonCommand(),[path.join(temp,'chapters/01-four-elements/narration/build_narration.py')],{encoding:'utf8'});
 assert.equal(build.status,0,build.stderr);
 const args=['--import',path.join(temp,'scripts/isolated-fonts.mjs'),path.join(temp,'production/qa/model-smoke.mjs')];
 const run=spawnSync(process.execPath,[...args,'--placeholder-cast'],{encoding:'utf8',cwd:temp});
 assert.equal(run.status,0,run.stderr+run.stdout);console.log(run.stdout.trim());
 const missing=spawnSync(process.execPath,args,{encoding:'utf8',cwd:temp});
 assert.notEqual(missing.status,0);assert.match(missing.stderr,/PRIVATE_ASSET_MISSING/);
 console.log('Public episode smoke: changed case, actual matrix pixels/glyphs, typography, selection and explicit missing-private failure passed.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
