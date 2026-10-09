import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {presentationModel} from '../../../../design/experiments/tabletop/presentation.mjs';
import {validateScenes,validateTimeline} from '../../../../scripts/validate-data.mjs';
import {protectedSubtitleTokens,validateSubtitleLines} from '../../../../scripts/text-contract.mjs';
const directory=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(directory,'../../../..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8')),hash=b=>createHash('sha256').update(b).digest('hex');
export const template=read('chapters/01-four-elements/editorial/zombie-kingdom-r2/blocks.template.json');
export function spokenScore(value){
 if(!Number.isInteger(value)||value<0||value>99)throw Error('Scores must be integer 0..99.');
 const digits='零一二三四五六七八九';if(value<10)return digits[value];
 return (value>=20?digits[Math.floor(value/10)]:'')+'十'+(value%10?digits[value%10]:'');
}
// Check semantic references before expansion: byte freshness alone cannot catch a
// known but incorrect cell/owner token that was rebuilt into every product.
function validateEditorialReferences(timeline){
 const blocks=new Map(template.blocks.map(block=>[block.id,block]));
 assert.equal(blocks.size,template.blocks.length,'Editorial block IDs must be unique.');
 const tokens=value=>(typeof value==='string'?[value]:value).flatMap(text=>[...text.matchAll(/\{\{([^}]+)\}\}/g)].map(match=>match[1]));
 const check=(id,field,expected)=>{
  const block=blocks.get(id);assert.ok(block,`Editorial semantic contract: missing ${id}.`);
  assert.deepEqual(tokens(block[field]),expected,`Editorial semantic contract: ${id}.${field} has wrong cell or owner references.`);
 };
 for(const [id,fields] of Object.entries({
  zk01_b21:{voiceover:['A'],spoken_emphasis:['A'],optional_breath_after:['A'],visual_intent:['A','red','blue']},
  zk01_b22:{voiceover:['B'],spoken_emphasis:['B'],optional_breath_after:['B'],visual_intent:['B','red','blue']},
  zk01_b23:{voiceover:['A','B'],spoken_emphasis:['A','B'],optional_breath_after:['A'],visual_intent:['A','B']},
  zk01_b32:{voiceover:['A','red','red','score.RR.A','blue','score.RB.A'],spoken_emphasis:['A','red','score.RR.A','score.RB.A'],optional_breath_after:['A','red','score.RR.A'],visual_intent:['A','red','A','B']}
 }))for(const [field,expected] of Object.entries(fields))check(id,field,expected);
 for(const [index,cell] of ['RR','RB','BR','BB'].entries()){
  const selectId=`zk01_b${24+index*2}`,scoreId=`zk01_b${25+index*2}`;
  const [row,column]=[...cell].map(choice=>choice==='R'?'red':'blue'),same=row===column;
  for(const [id,action] of [[selectId,'highlight_choices'],[scoreId,'reveal_scores']]){
   const source=timeline.segments.filter(segment=>segment.visual_cue.action===action&&segment.visual_cue.matrix_cell===cell);
   assert.equal(source.length,1,`Editorial semantic contract: ${cell} requires exactly one ${action} source.`);
   assert.deepEqual(blocks.get(id)?.original_segment_ids,source.map(segment=>segment.id),`Editorial semantic contract: ${id} must reference the ${cell} ${action} source.`);
  }
  const choices=same?[row]:['A',row,'B',column];
  check(selectId,'voiceover',choices);check(selectId,'spoken_emphasis',choices);
  check(selectId,'optional_breath_after',same?[]:['A',row]);check(selectId,'visual_intent',choices);
  check(scoreId,'voiceover',same?[`joint.${cell}`]:['A',`score.${cell}.A`,'B',`score.${cell}.B`]);
  check(scoreId,'spoken_emphasis',same?[`emphasis.${cell}`]:['A',`score.${cell}.A`,'B',`score.${cell}.B`]);
  check(scoreId,'optional_breath_after',same?[]:['A',`score.${cell}.A`]);
  check(scoreId,'visual_intent',same?[row,`pair.${cell}`]:[`pair.${cell}`]);
 }
}
function validateEditorialSubtitles(blocks,timeline,words){
 const players=[words.A,words.B],strategies=[words.red,words.blue];
 const sourceById=new Map(timeline.segments.map(segment=>[segment.id,segment]));
 for(const block of blocks){
  if(!Object.hasOwn(block,'subtitle_chunks'))continue;
  const chunks=block.subtitle_chunks,role=`Editorial subtitles: ${block.id}`;
  assert(Array.isArray(chunks)&&chunks.length>0,`${role}: subtitle_chunks must be a nonempty array`);
  assert(chunks.every(chunk=>typeof chunk.spoken_span==='string'),`${role}: each chunk needs a spoken_span`);
  assert.equal(chunks.map(chunk=>chunk.spoken_span).join(''),block.voiceover,`${role}: spoken spans must preserve the exact voiceover`);
  const cues=block.original_segment_ids.map(id=>sourceById.get(id)?.visual_cue??{});
  for(const chunk of chunks){
   validateSubtitleLines(chunk.suggested_lines,chunk.spoken_span,players,strategies,{},`${role}/${chunk.id}`);
   for(const cue of cues)validateSubtitleLines(chunk.suggested_lines,chunk.spoken_span,players,strategies,cue,`${role}/${chunk.id}`);
  }
  for(const chunk of chunks.slice(0,-1))assert('，；。！？：'.includes(chunk.spoken_span.at(-1)),`${role}: subtitle chunks must break only after clause punctuation`);
  // Chunk boundaries must protect the same current-case names, choices and
  // complete payoff clauses as line boundaries, including punctuated labels.
  const tokens=new Set([...protectedSubtitleTokens(players,strategies),...cues.flatMap(cue=>protectedSubtitleTokens(players,strategies,cue))]);
  const lines=chunks.flatMap(chunk=>chunk.suggested_lines);
  for(const token of tokens){
   const occurrences=text=>text.split(token).length-1;
   assert.equal(lines.reduce((sum,line)=>sum+occurrences(line),0),occurrences(block.voiceover),`${role}: subtitle chunks split protected current-case token or clause: ${token}`);
  }
 }
}
export function resolveDraft({scene,presentation,timeline,sourceHash}){
 validateScenes(scene);validateTimeline(timeline,scene);const view=presentationModel(presentation,scene);
 validateEditorialReferences(timeline);
 const words={A:view.actors.A.name,B:view.actors.B.name,series:presentation.series,red:scene.strategies[0].label,blue:scene.strategies[1].label};words.gameLabel=words.red+words.blue+'牌局';
 const values=Object.fromEntries(['RR','RB','BR','BB'].map((key,i)=>[key,scene.payoffs[Math.floor(i/2)][i%2]]));
 for(const [cell,pair] of Object.entries(values)){
  words[`pair.${cell}`]=`（${pair.join('，')}）`;
  for(const [i,id] of ['A','B'].entries())words[`score.${cell}.${id}`]=spokenScore(pair[i]);
  words[`joint.${cell}`]=pair[0]===pair[1]?`各得${spokenScore(pair[0])}分。`:`${words.A}得${spokenScore(pair[0])}分，${words.B}得${spokenScore(pair[1])}分。`;
  words[`emphasis.${cell}`]=pair[0]===pair[1]?['各',`${spokenScore(pair[0])}分`]:['A','B'].map((id,index)=>`${words[id]}${spokenScore(pair[index])}分`);
 }
 const word=key=>{if(!Object.hasOwn(words,key))throw Error(`Unknown editorial token ${key}`);return words[key]};
 const resolve=text=>text.replace(/\{\{([^}]+)\}\}/g,(_,key)=>word(key));
 const resolveDeep=value=>{
  if(typeof value==='string'){
   const key=value.match(/^\{\{([^}]+)\}\}$/)?.[1];
   return key&&Array.isArray(word(key))?[...word(key)]:resolve(value);
  }
  // A whole emphasis token expands to list entries, while nested authored arrays
  // remain arrays. This preserves the default symmetric recording notes exactly.
  if(Array.isArray(value))return value.flatMap(item=>{const resolved=resolveDeep(item);return typeof item==='string'&&Array.isArray(resolved)?resolved:[resolved]});
  return value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,value])=>[key,resolveDeep(value)])):value;
 };
 const blocks=template.blocks.map(block=>({...resolveDeep(block),timing:null}));
 validateEditorialSubtitles(blocks,timeline,words);
 const oldIds=new Set(timeline.segments.map(s=>s.id)),mapped=new Set(blocks.flatMap(b=>b.original_segment_ids));
 if(oldIds.size!==mapped.size||[...mapped].some(id=>!oldIds.has(id)))throw Error('Draft must map all original segment IDs.');
 const plain=blocks.map(b=>b.voiceover).join('\n\n')+'\n';
 const count=text=>(text.match(/[\u4e00-\u9fffA-Za-z0-9]/g)||[]).length;
 const draft={schema:'zombie_kingdom_semantic_draft_v1',draft_version:template.draft_version,status:template.status,language:'zh-CN',not_a_production_timeline:true,human_audio_available:false,audio_alignment_status:'not_started_waiting_for_human_recording',production_timeline_update_authorized:false,user_final_approval:false,title_selection_status:'candidates_only_not_approved',series_label:presentation.series,source_metadata_status:template.source_metadata_status,source_metadata_history:template.source_metadata_history,
  timing_notice:'无时间码语义草稿；timing 全部 null。先确认真人口播，再人工建立参考时间轴并按实录重定时；不得硬套旧片长或覆盖正式 timeline。',
  source:{repository_url:'https://github.com/trainMyBrain233/game-theory-studio',reference_commit:template.reference_commit,reference_timeline_sha256:template.reference_timeline_sha256,active_timeline_sha256:sourceHash,timeline_repository_relative_path:'chapters/01-four-elements/narration/timeline.json',source_reference_duration_seconds:timeline.duration,source_reference_duration_is_recording_target:false,old_recording_pack_status:'delivered_legacy_small_A_B_version_pending_revision',presentation_source:'design/experiments/tabletop/presentation.json',case_source:'design/scenes.json'},
  metrics:{definition:'汉字、拉丁字母和数字逐字符计数，不含空白标点；文量不是片长预测。',old_spoken_character_count:count(timeline.segments.map(s=>s.voiceover).join('')),draft_spoken_character_count:count(plain),old_semantic_blocks:timeline.segments.length,draft_semantic_blocks:blocks.length},
  model_contract:{game_rounds:1,current_choices_observed_before_deciding:false,score_rules_public_to_both:true,players:{A:{display_name:words.A,matrix_axis:'row',payoff_index:0,avatar:presentation.actors.A.avatar},B:{display_name:words.B,matrix_axis:'column',payoff_index:1,avatar:presentation.actors.B.avatar}},matrix_values:values,matrix_reveal_order:['RR','RB','BR','BB'],payoff_read_order:[words.A,words.B],internal_keys_visible_to_audience:false,multi_round_example:{is_comparison_only:true,return_to_one_round_block:'zk01_b17'},no_predicted_choice_or_equilibrium:true},
  recording_contract:{pace:'按自然语速和意义断句，不追旧片长。',read_titles_ids_and_notes:false,keep_names_and_number_units_together:true,pronunciation:{行:'háng'},recommended_contiguous_groups:[['zk01_b15','zk01_b16','zk01_b17'],['zk01_b20','zk01_b21','zk01_b22','zk01_b23'],['zk01_b24','zk01_b25'],['zk01_b26','zk01_b27'],['zk01_b28','zk01_b29'],['zk01_b30','zk01_b31'],['zk01_b32','zk01_b33']]},
  sections:['intro','players','information','strategy','payoffs','recap'].map(id=>({id,block_ids:blocks.filter(b=>b.section===id).map(b=>b.id)})),blocks};
 const mapping={draft_version:template.draft_version,source_timeline_sha256:sourceHash,mapping:timeline.segments.map(s=>({original_id:s.id,original_voiceover:s.voiceover,draft_block_ids:blocks.filter(b=>b.original_segment_ids.includes(s.id)).map(b=>b.id),draft_voiceovers:blocks.filter(b=>b.original_segment_ids.includes(s.id)).map(b=>b.voiceover)}))};
 return {'第一集_语义块草稿_无音频时间码.json':JSON.stringify(draft,null,2)+'\n','原段ID映射.json':JSON.stringify(mapping,null,2)+'\n','第一集_提词器净稿_r2.txt':plain};
}
export function currentProducts(){
 const bytes=fs.readFileSync(path.join(root,'chapters/01-four-elements/narration/timeline.json'));
 return resolveDraft({scene:read('design/scenes.json'),presentation:read('design/experiments/tabletop/presentation.json'),timeline:JSON.parse(bytes.toString('utf8')),sourceHash:hash(bytes)});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.length>1||args.length===1&&args[0]!=='--check')throw Error('Use no arguments to rebuild this draft, or --check for read-only validation.');
 for(const [name,text] of Object.entries(currentProducts())){
  const file=path.join(directory,name);
  if(args[0]==='--check'){if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==text)throw Error(`Stale editorial product ${name}; explicit rebuild required.`);}else fs.writeFileSync(file,text);
 }
 console.log(args[0]==='--check'?'Editorial draft: read-only products match current shared case/presentation.':'Wrote r2 semantic draft, 37-ID mapping and clean teleprompter text; no production timeline changed.');
}
