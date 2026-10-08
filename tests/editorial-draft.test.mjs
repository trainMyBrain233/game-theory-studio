import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {withSourceFixture} from '../scripts/source-fixture.mjs';
import {pythonCommand} from '../scripts/python.mjs';
import {currentProducts,spokenScore} from '../chapters/01-four-elements/editorial/zombie-kingdom-r2/build.mjs';
const relative='chapters/01-four-elements/editorial/zombie-kingdom-r2';
test('r2 resolves complete 40-block speech and 37-ID coverage without inventing audio timing',()=>{
 const products=currentProducts(),draft=JSON.parse(products['第一集_语义块草稿_无音频时间码.json']),mapping=JSON.parse(products['原段ID映射.json']);
 assert.equal(draft.blocks.length,40);assert.equal(mapping.mapping.length,37);
 assert.deepEqual(draft.blocks.map(b=>b.id),Array.from({length:40},(_,i)=>`zk01_b${String(i+1).padStart(2,'0')}`));
 assert.equal(products['第一集_提词器净稿_r2.txt'],draft.blocks.map(b=>b.voiceover).join('\n\n')+'\n');
 assert.ok(draft.blocks.every(b=>b.timing===null));assert.equal(draft.user_final_approval,false);assert.equal(draft.production_timeline_update_authorized,false);assert.equal(draft.human_audio_available,false);
 assert.equal(draft.source.source_reference_duration_is_recording_target,false);assert.equal('duration' in draft,false);assert.equal(draft.model_contract.multi_round_example.return_to_one_round_block,'zk01_b17');
 assert.equal(draft.model_contract.players.A.payoff_index,0);assert.equal(draft.model_contract.players.B.payoff_index,1);
 const chunks=draft.blocks.find(b=>b.id==='zk01_b14').subtitle_chunks;
 assert.equal(chunks.map(c=>c.spoken_span).join(''),draft.blocks.find(b=>b.id==='zk01_b14').voiceover);
 assert.ok(chunks.every(c=>c.timing===null&&c.suggested_lines.length<=2&&c.suggested_lines.every(l=>(l.match(/[\u4e00-\u9fffA-Za-z0-9]/g)||[]).length<=22)));
 assert.equal(draft.blocks.some(b=>b.voiceover.includes('支付')),false);
 for(const row of mapping.mapping)assert.deepEqual(row.draft_voiceovers,row.draft_block_ids.map(id=>draft.blocks.find(b=>b.id===id).voiceover));
});
test('explicit draft builds read current identity and asymmetric case; stale check is read-only',()=>{
 withSourceFixture(root=>{
  const sceneFile=path.join(root,'design/scenes.json'),scene=JSON.parse(fs.readFileSync(sceneFile,'utf8'));
  scene.strategies[0].label='合作';scene.strategies[1].label='退出';scene.payoffs=[[[11,12],[21,22]],[[31,32],[41,42]]];fs.writeFileSync(sceneFile,JSON.stringify(scene));
  const identityFile=path.join(root,'design/experiments/tabletop/presentation.json'),identity=JSON.parse(fs.readFileSync(identityFile,'utf8'));identity.actors.A.name='明月';identity.actors.B.name='青禾';fs.writeFileSync(identityFile,JSON.stringify(identity));
  const build=spawnSync(process.execPath,['scripts/build-narration.mjs'],{cwd:root,encoding:'utf8',env:{...process.env,PYTHON:pythonCommand()}});assert.equal(build.status,0,build.stderr);
  const run=args=>spawnSync(process.execPath,[`${relative}/build.mjs`,...args],{cwd:root,encoding:'utf8'});
  assert.equal(run([]).status,0);const target=path.join(root,relative,'第一集_提词器净稿_r2.txt'),text=fs.readFileSync(target,'utf8');
  assert.ok(text.includes('明月和青禾准备玩一轮合作退出牌局。'));
  assert.ok(text.includes('明月得十一分，青禾得十二分。'));
  assert.ok(text.includes('明月得二十一分，青禾得二十二分。'));
  assert.ok(text.includes('对方选合作，他得十一分；对方选退出，他得二十一分。'));
  assert.ok(!/小A|小B|普通僵尸|路障僵尸|各得三分/.test(text));assert.equal(run(['--check']).status,0);
  const changed=text+'过期派生内容\n';fs.writeFileSync(target,changed);assert.notEqual(run(['--check']).status,0);assert.equal(fs.readFileSync(target,'utf8'),changed,'QA must not repair/overwrite authored edits.');
 });
});
test('spoken score conversion rejects unsupported data rather than baking old numbers',()=>{
 assert.deepEqual([0,3,11,20,99].map(spokenScore),['零','三','十一','二十','九十九']);
 for(const number of [-1,100,1.5,NaN,true])assert.throws(()=>spokenScore(number),/integer/);
});
