import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {withSourceFixture} from '../scripts/source-fixture.mjs';
import {pythonCommand} from '../scripts/python.mjs';
import {currentProducts,resolveDraft,spokenScore,template} from '../chapters/01-four-elements/editorial/zombie-kingdom-r2/build.mjs';
const relative='chapters/01-four-elements/editorial/zombie-kingdom-r2';
test('r2 resolves complete 40-block speech and 37-ID coverage without inventing audio timing',()=>{
 const products=currentProducts(),draft=JSON.parse(products['第一集_语义块草稿_无音频时间码.json']),mapping=JSON.parse(products['原段ID映射.json']);
 assert.equal(draft.blocks.length,40);assert.equal(mapping.mapping.length,37);
 assert.deepEqual(draft.blocks.map(b=>b.id),Array.from({length:40},(_,i)=>`zk01_b${String(i+1).padStart(2,'0')}`));
 assert.equal(products['第一集_提词器净稿_r2.txt'],draft.blocks.map(b=>b.voiceover).join('\n\n')+'\n');
 assert.ok(draft.blocks.every(b=>b.timing===null));assert.equal(draft.user_final_approval,false);assert.equal(draft.production_timeline_update_authorized,false);assert.equal(draft.human_audio_available,false);
 assert.equal(draft.source_metadata_status,'complete_block_notes_received_r2_followup');assert.ok(draft.source_metadata_history.includes('partial_block_notes_truncated_in_delegation_message'));
 assert.ok(draft.blocks.every(b=>Array.isArray(b.spoken_emphasis)&&Array.isArray(b.optional_breath_after)&&b.visual_intent&&b.recording_note));
 assert.equal(draft.source.source_reference_duration_is_recording_target,false);assert.equal('duration' in draft,false);assert.equal(draft.model_contract.multi_round_example.return_to_one_round_block,'zk01_b17');
 assert.equal(draft.model_contract.players.A.payoff_index,0);assert.equal(draft.model_contract.players.B.payoff_index,1);
 const chunks=draft.blocks.find(b=>b.id==='zk01_b14').subtitle_chunks;
 assert.equal(chunks.map(c=>c.spoken_span).join(''),draft.blocks.find(b=>b.id==='zk01_b14').voiceover);
 assert.ok(chunks.every(c=>c.timing===null&&c.suggested_lines.length<=2&&c.suggested_lines.every(l=>(l.match(/[\u4e00-\u9fffA-Za-z0-9]/g)||[]).length<=22)));
 assert.equal(draft.blocks.some(b=>b.voiceover.includes('支付')),false);
 for(const row of mapping.mapping)assert.deepEqual(row.draft_voiceovers,row.draft_block_ids.map(id=>draft.blocks.find(b=>b.id===id).voiceover));
});
const productNames=['第一集_语义块草稿_无音频时间码.json','原段ID映射.json','第一集_提词器净稿_r2.txt'];
const readJSON=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const runBuild=(root,args=[])=>spawnSync(process.execPath,[`${relative}/build.mjs`,...args],{cwd:root,encoding:'utf8'});
const block=(draft,number)=>draft.blocks.find(item=>item.id===`zk01_b${String(number).padStart(2,'0')}`);
// Independent expected words intentionally do not call the production spokenScore
// helper. Every cell and every owner's score is unique in this fixture.
const cases=[
 {cell:'RR',row:0,column:0,select:24,score:25,words:['十一','十二']},
 {cell:'RB',row:0,column:1,select:26,score:27,words:['二十一','二十二']},
 {cell:'BR',row:1,column:0,select:28,score:29,words:['三十一','三十二']},
 {cell:'BB',row:1,column:1,select:30,score:31,words:['四十一','四十二']}
];
function asymmetricFixture(root){
 const sceneFile=path.join(root,'design/scenes.json'),scene=readJSON(sceneFile);
 scene.actors[0].label='甲方同学';scene.actors[1].label='乙方同学';
 scene.strategies[0].label='合作';scene.strategies[1].label='退出';scene.payoffs=[[[11,12],[21,22]],[[31,32],[41,42]]];
 scene.selected={row:1,column:0,actorA:'blue',actorB:'red'};fs.writeFileSync(sceneFile,JSON.stringify(scene));
 const identityFile=path.join(root,'design/experiments/tabletop/presentation.json'),identity=readJSON(identityFile);
 identity.actors.A.name='明月同学';identity.actors.B.name='青禾同学';fs.writeFileSync(identityFile,JSON.stringify(identity));
 const result=spawnSync(process.execPath,['scripts/build-narration.mjs'],{cwd:root,encoding:'utf8',env:{...process.env,PYTHON:pythonCommand()}});
 assert.equal(result.status,0,result.stderr);
 return {scene,identity,timeline:readJSON(path.join(root,'chapters/01-four-elements/narration/timeline.json'))};
}
function assertAsymmetricPayoffs(draft,{scene,identity,timeline}){
 const A=identity.actors.A.name,B=identity.actors.B.name;
 assert.deepEqual(draft.model_contract.matrix_values,Object.fromEntries(cases.map(({cell,row,column})=>[cell,scene.payoffs[row][column]])));
 assert.deepEqual(draft.model_contract.matrix_reveal_order,['RR','RB','BR','BB']);
 assert.deepEqual(draft.model_contract.payoff_read_order,[A,B]);
 assert.deepEqual(draft.model_contract.players,{A:{display_name:A,matrix_axis:'row',payoff_index:0,avatar:identity.actors.A.avatar},B:{display_name:B,matrix_axis:'column',payoff_index:1,avatar:identity.actors.B.avatar}});
 assert.equal(block(draft,21).voiceover,`${A}选的牌，决定看哪一行。`);
 assert.equal(block(draft,22).voiceover,`${B}选的牌，决定看哪一列。`);
 assert.equal(block(draft,23).voiceover,`每个格子里，先读${A}的分数，再读${B}的分数。`);
 assert.ok(block(draft,21).visual_intent.includes(`左侧放${A}小头像和全名`));
 assert.ok(block(draft,22).visual_intent.includes(`上方放${B}小头像和全名`));
 assert.ok(block(draft,23).visual_intent.includes(`${A}头像在前、${B}头像在后`));
 for(const {cell,row,column,select,score,words} of cases){
  const pair=scene.payoffs[row][column],choices=[scene.strategies[row].label,scene.strategies[column].label];
  const selection=block(draft,select),reveal=block(draft,score);
  assert.equal(selection.voiceover,row===column?`两位都选${choices[0]}牌。`:`${A}选${choices[0]}，${B}选${choices[1]}。`,`${cell} choice ownership`);
  assert.ok(selection.visual_intent.includes(row===column?`双${choices[0]}`:`${A}${choices[0]}行与${B}${choices[1]}列`),`${cell} visual choice ownership`);
  assert.equal(reveal.voiceover,`${A}得${words[0]}分，${B}得${words[1]}分。`,`${cell} narrated payoff ownership`);
  assert.deepEqual(reveal.spoken_emphasis,[`${A}${words[0]}分`,`${B}${words[1]}分`],`${cell} emphasis must name both unequal payoffs`);
  assert.deepEqual(reveal.visual_intent.match(/（[0-9]+，[0-9]+）/g),[`（${pair[0]}，${pair[1]}）`],`${cell} visual pair must match its own matrix cell`);
  const sourceSelection=timeline.segments.find(segment=>segment.visual_cue.matrix_cell===cell&&segment.visual_cue.action==='highlight_choices');
  const sourceReveal=timeline.segments.find(segment=>segment.visual_cue.matrix_cell===cell&&segment.visual_cue.action==='reveal_scores');
  assert.deepEqual(selection.original_segment_ids,[sourceSelection.id]);assert.deepEqual(reveal.original_segment_ids,[sourceReveal.id]);
  assert.deepEqual(sourceSelection.visual_cue.choices,{A:choices[0],B:choices[1]});
  assert.deepEqual(sourceReveal.visual_cue.scores,pair);
  assert.deepEqual(Object.fromEntries(sourceReveal.visual_cue.score_reveals.map(event=>[event.player,event.value])),{A:pair[0],B:pair[1]});
  assert.equal(sourceReveal.voiceover,`${scene.actors[0].label}得${words[0]}分，${scene.actors[1].label}得${words[1]}分。`);
  assert.equal(sourceReveal.lines.join(''),sourceReveal.voiceover,`${cell} subtitle ownership`);
 }
 assert.equal(block(draft,32).voiceover,`盯住${A}选合作的这一行：对方选合作，他得十一分；对方选退出，他得二十一分。`);
 assert.deepEqual(block(draft,32).spoken_emphasis,[`${A}选合作`,'十一分','二十一分']);
}
test('explicit draft builds independently verify all four asymmetric cells and owners; stale check is read-only',()=>{
 withSourceFixture(root=>{
  const context=asymmetricFixture(root),result=runBuild(root);assert.equal(result.status,0,result.stderr);
  const directory=path.join(root,relative),target=path.join(directory,productNames[2]),text=fs.readFileSync(target,'utf8');
  const draft=readJSON(path.join(directory,productNames[0]));assertAsymmetricPayoffs(draft,context);
  assert.ok(text.includes('明月同学和青禾同学准备玩一轮合作退出牌局。'));
  assert.equal(text,draft.blocks.map(item=>item.voiceover).join('\n\n')+'\n');
  assert.ok(!/小A|小B|普通僵尸|路障僵尸|各得三分|各得一分/.test(text));
  const mapping=readJSON(path.join(directory,productNames[1]));
  for(const row of mapping.mapping)assert.deepEqual(row.draft_voiceovers,row.draft_block_ids.map(id=>draft.blocks.find(item=>item.id===id).voiceover));
  assert.equal(runBuild(root,['--check']).status,0);
  const changed=text+'过期派生内容\n';fs.writeFileSync(target,changed);
  const before=productNames.map(name=>fs.readFileSync(path.join(directory,name)));
  const stale=runBuild(root,['--check']);assert.notEqual(stale.status,0);assert.match(stale.stderr,/Stale editorial product/);
  assert.deepEqual(productNames.map(name=>fs.readFileSync(path.join(directory,name))),before,'QA must not repair/overwrite any authored edits.');
 });
});
test('editorial builds reject contradictory cell, choice and owner references before writing products',()=>{
 withSourceFixture(root=>{
  asymmetricFixture(root);const initial=runBuild(root);assert.equal(initial.status,0,initial.stderr);
  const directory=path.join(root,relative),file=path.join(directory,'blocks.template.json'),original=readJSON(file);
  const before=productNames.map(name=>fs.readFileSync(path.join(directory,name)));
  const mutations=[];
  for(const {cell,select,score} of cases){
   const other=cell==='RB'?'BR':'RB';
   mutations.push([`${cell} visual pair`,draft=>{const item=block(draft,score);item.visual_intent=item.visual_intent.replace(`pair.${cell}`,`pair.${other}`)}]);
   mutations.push([`${cell} narration`,draft=>{const item=block(draft,score);item.voiceover=item.voiceover.replace(cell=== 'RR'||cell==='BB'?`joint.${cell}`:`score.${cell}.A`,cell==='RR'||cell==='BB'?`joint.${other}`:`score.${cell}.B`)}]);
   mutations.push([`${cell} choices`,draft=>{const item=block(draft,select);item.voiceover=item.voiceover.replace(/\{\{(red|blue)\}\}/,(_,strategy)=>`{{${strategy==='red'?'blue':'red'}}}`)}]);
   mutations.push([`${cell} emphasis`,draft=>{const item=block(draft,score);item.spoken_emphasis=item.spoken_emphasis.map(text=>text.replace(cell==='RR'||cell==='BB'?`emphasis.${cell}`:`score.${cell}.A`,cell==='RR'||cell==='BB'?`emphasis.${other}`:`score.${cell}.B`))}]);
   mutations.push([`${cell} source mapping`,draft=>{block(draft,score).original_segment_ids=block(draft,cases.find(item=>item.cell===other).score).original_segment_ids}]);
  }
  mutations.push(
   ['row owner',draft=>{block(draft,21).voiceover=block(draft,21).voiceover.replace('{{A}}','{{B}}')}],
   ['column owner',draft=>{block(draft,22).visual_intent=block(draft,22).visual_intent.replace('{{B}}','{{A}}')}],
   ['payoff read order',draft=>{block(draft,23).voiceover=block(draft,23).voiceover.replace(/\{\{([AB])\}\}/g,(_,id)=>`{{${id==='A'?'B':'A'}}}`)}],
   ['focused comparison owner',draft=>{block(draft,32).voiceover=block(draft,32).voiceover.replace('score.RR.A','score.RR.B')}],
   ['BR breath payoff owner',draft=>{block(draft,29).optional_breath_after[0]=block(draft,29).optional_breath_after[0].replace('score.BR.A','score.BR.B')}]
  );
  for(const [name,mutate] of mutations){
   const changed=structuredClone(original);mutate(changed);assert.notDeepEqual(changed,original,`${name}: mutation must contradict the current template`);fs.writeFileSync(file,JSON.stringify(changed));
   for(const args of [[],['--check']]){
    const result=runBuild(root,args);assert.notEqual(result.status,0,`${name}: ${args[0]??'build'} unexpectedly passed`);
    assert.match(result.stderr,/Editorial semantic contract/,`${name}: must fail semantics, not freshness`);
    assert.deepEqual(productNames.map(name=>fs.readFileSync(path.join(directory,name))),before,`${name}: failed validation must not write products`);
   }
  }
 });
});
test('fresh rebuilt BR visual-token mutation still fails semantic QA and independent asymmetric assertions',()=>{
 withSourceFixture(root=>{
  const context=asymmetricFixture(root),directory=path.join(root,relative),templateFile=path.join(directory,'blocks.template.json');
  const draft=readJSON(templateFile);block(draft,29).visual_intent=block(draft,29).visual_intent.replace('pair.BR','pair.RB');fs.writeFileSync(templateFile,JSON.stringify(draft));
  // Reproduce the old blind-expansion behavior in this disposable source copy,
  // producing internally fresh files instead of relying on a stale-file failure.
  const buildFile=path.join(directory,'build.mjs'),guarded=fs.readFileSync(buildFile,'utf8'),unchecked=guarded.replace(' validateEditorialReferences(timeline);',' // Mutation: omit semantic validation.');
  assert.notEqual(unchecked,guarded);fs.writeFileSync(buildFile,unchecked);
  const rebuild=runBuild(root);assert.equal(rebuild.status,0,rebuild.stderr);assert.equal(runBuild(root,['--check']).status,0);
  const wrong=readJSON(path.join(directory,productNames[0]));assert.ok(block(wrong,29).visual_intent.includes('（21，22）'));
  assert.throws(()=>assertAsymmetricPayoffs(wrong,context),/BR visual pair/);
  fs.writeFileSync(buildFile,guarded);const before=productNames.map(name=>fs.readFileSync(path.join(directory,name)));
  const checked=runBuild(root,['--check']);assert.notEqual(checked.status,0);assert.match(checked.stderr,/Editorial semantic contract: zk01_b29.visual_intent/);assert.doesNotMatch(checked.stderr,/Stale editorial product/);
  assert.deepEqual(productNames.map(name=>fs.readFileSync(path.join(directory,name))),before);
 });
});
test('spoken score conversion rejects unsupported data rather than baking old numbers',()=>{
 assert.deepEqual([0,3,11,20,99].map(spokenScore),['零','三','十一','二十','九十九']);
 for(const number of [-1,100,1.5,NaN,true])assert.throws(()=>spokenScore(number),/integer/);
});

function withTemplateMutation(mutate,check){
 const original=structuredClone(template.blocks);
 try{mutate(template);return check();}finally{template.blocks=original;}
}
const draftChunk=(id,spoken_span,suggested_lines=[spoken_span])=>({id,spoken_span,suggested_lines,timing:null});
test('default editorial validation preserves every generated byte',()=>{
 for(const [name,text] of Object.entries(currentProducts()))assert.equal(text,fs.readFileSync(new URL(`../${relative}/${name}`,import.meta.url),'utf8'));
});
for(const [name,mutate,expected] of [
 ['different suggested speech',draft=>block(draft,14).subtitle_chunks[0].suggested_lines=['错误文字'],/preserve the exact voiceover/],
 ['missing spoken chunk',draft=>block(draft,14).subtitle_chunks.pop(),/spoken spans must preserve the exact voiceover/],
 ['changed spoken span',draft=>block(draft,14).subtitle_chunks[0].spoken_span='错误文字',/spoken spans must preserve the exact voiceover/],
 ['empty chunks',draft=>block(draft,14).subtitle_chunks=[],/nonempty array/],
 ['empty lines',draft=>block(draft,14).subtitle_chunks[0].suggested_lines=[],/one or two lines/],
 ['three lines',draft=>block(draft,14).subtitle_chunks[0].suggested_lines=['一般来说，','策略是','一整套应对计划：'],/one or two lines/],
 ['mid-clause line break',draft=>block(draft,14).subtitle_chunks[0].suggested_lines=['一般来','说，策略是一整套应对计划：'],/break only after clause punctuation/],
 ['mid-clause chunk break',draft=>{const item=block(draft,14);item.subtitle_chunks.splice(0,1,draftChunk('left','一般来'),draftChunk('right','说，策略是一整套应对计划：'));},/chunks must break only after clause punctuation/],
 ['newline control',draft=>block(draft,14).subtitle_chunks[0].suggested_lines=['一般来说，\n策略是一整套应对计划：'],/single-line without controls/],
 ['invisible character',draft=>block(draft,14).subtitle_chunks[0].suggested_lines=['一般来说，\u200b策略是一整套应对计划：'],/default-ignorable/],
 ['23 readable CJK characters',draft=>{const item=block(draft,14);item.voiceover='𠮷'.repeat(23)+'。';item.subtitle_chunks=[draftChunk('long',item.voiceover)];},/exceeds 22 readable characters/],
])test(`production editorial resolution rejects ${name}`,()=>{
 withTemplateMutation(mutate,()=>assert.throws(()=>currentProducts(),expected));
});

test('editorial chunks preserve current presentation names within lines and across groups',()=>{
 const scene=readJSON(new URL('../design/scenes.json',import.meta.url)),presentation=readJSON(new URL('../design/experiments/tabletop/presentation.json',import.meta.url)),timeline=readJSON(new URL('../chapters/01-four-elements/narration/timeline.json',import.meta.url));
 presentation.actors.A.name='明月，同学';presentation.actors.B.name='青禾同学';
 const build=()=>resolveDraft({scene,presentation,timeline,sourceHash:'test-source'});
 withTemplateMutation(draft=>{
  const item=block(draft,5);item.voiceover='{{A}}和{{B}}各自选牌。';item.subtitle_chunks=[draftChunk('names',item.voiceover)];
 },()=>{
  assert.doesNotThrow(build,'A punctuated name is valid when kept whole');
  const item=block(template,5);item.subtitle_chunks=[draftChunk('names',item.voiceover,['明月，','同学和{{B}}各自选牌。'])];
  assert.throws(build,/protected current-case token or clause: 明月，同学/);
  item.subtitle_chunks=[draftChunk('left','明月，'),draftChunk('right','同学和{{B}}各自选牌。')];
  assert.throws(build,/chunks split protected current-case token or clause: 明月，同学/);
  item.original_segment_ids=[]; // Other blocks still cover these shared source IDs.
  assert.throws(build,/chunks split protected current-case token or clause: 明月，同学/,'Current labels stay protected without a source cue');
 });
});

test('editorial chunks protect current strategy labels even when their punctuation looks like a legal break',()=>{
 withSourceFixture(root=>{
  const sceneFile=path.join(root,'design/scenes.json'),scene=readJSON(sceneFile),presentation=readJSON(path.join(root,'design/experiments/tabletop/presentation.json'));
  scene.strategies[0].label='，R';fs.writeFileSync(sceneFile,JSON.stringify(scene));
  // Rebuild structured cues and speech from the current case. Text replacement
  // would miss renamed strategies or accidentally alter matching player names.
  const rebuilt=spawnSync(process.execPath,['scripts/build-narration.mjs'],{cwd:root,encoding:'utf8',env:{...process.env,PYTHON:pythonCommand()}});
  assert.equal(rebuilt.status,0,rebuilt.stderr);
  const timeline=readJSON(path.join(root,'chapters/01-four-elements/narration/timeline.json'));
  assert.deepEqual(timeline.visual_contract.participants,scene.actors.map(actor=>actor.label));
  const build=()=>resolveDraft({scene,presentation,timeline,sourceHash:'test-source'});
  withTemplateMutation(draft=>{
   const item=block(draft,12);item.subtitle_chunks=[draftChunk('strategies',item.voiceover)];
  },()=>{
   assert.doesNotThrow(build);
   const item=block(template,12);item.subtitle_chunks=[draftChunk('strategies',item.voiceover,['这一轮，每位都可以选，','R牌，或者{{blue}}牌。'])];
   assert.throws(build,/protected current-case token or clause: ，R/);
   item.subtitle_chunks=[draftChunk('left','这一轮，每位都可以选，'),draftChunk('right','R牌，或者{{blue}}牌。')];
   assert.throws(build,/chunks split protected current-case token or clause: ，R/);
  });
 });
});

for(const [number,first,rest] of [
 [26,'{{A}}，','选{{red}}，{{B}}选{{blue}}。'],
 [27,'{{A}}，','得{{score.RB.A}}分，{{B}}得{{score.RB.B}}分。'],
])test(`editorial chunks keep block ${number}'s current choice or payoff clause intact`,()=>{
 withTemplateMutation(draft=>{
  const item=block(draft,number);item.voiceover=first+rest;item.subtitle_chunks=[draftChunk('whole',item.voiceover)];
 },()=>{
  assert.doesNotThrow(currentProducts);
  const item=block(template,number);item.subtitle_chunks=[draftChunk('split',item.voiceover,[first,rest])];
  assert.throws(currentProducts,/protected current-case token or clause/);
  item.subtitle_chunks=[draftChunk('first',first),draftChunk('rest',rest)];
  assert.throws(currentProducts,/chunks split protected current-case token or clause/);
 });
});

test('editorial template tokens reject unknown and inherited Object properties in every expansion path',()=>{
 for(const key of ['missing','__proto__','constructor','toString','valueOf','hasOwnProperty','isPrototypeOf','propertyIsEnumerable','__defineGetter__']){
  for(const mutate of [
   draft=>{block(draft,'01').recording_note=`{{${key}}}`},
   draft=>{block(draft,'01').recording_note=`旁注：{{${key}}}。`},
   draft=>{block(draft,'01').spoken_emphasis=[`{{${key}}}`]},
  ])withTemplateMutation(mutate,()=>assert.throws(currentProducts,new RegExp(`Unknown editorial token ${key}`)));
 }
});

test('build and check reject malformed editorial subtitles and inherited tokens without writing products',()=>{
 withSourceFixture(root=>{
  const directory=path.join(root,relative),file=path.join(directory,'blocks.template.json'),original=readJSON(file);
  const before=productNames.map(name=>fs.readFileSync(path.join(directory,name)));
  for(const [mutate,expected] of [
   [draft=>{block(draft,14).subtitle_chunks[0].suggested_lines=['错误文字']},/Editorial subtitles:.*preserve the exact voiceover/],
   [draft=>{block(draft,'01').recording_note='{{constructor}}'},/Unknown editorial token constructor/],
  ]){
   const changed=structuredClone(original);mutate(changed);fs.writeFileSync(file,JSON.stringify(changed));
   for(const args of [[],['--check']]){
    const result=runBuild(root,args);assert.notEqual(result.status,0);assert.match(result.stderr,expected);assert.doesNotMatch(result.stderr,/Stale editorial product/);
    assert.deepEqual(productNames.map(name=>fs.readFileSync(path.join(directory,name))),before);
   }
  }
 });
});
