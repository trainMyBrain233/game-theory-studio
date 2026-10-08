import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {presentationModel} from '../../../../design/experiments/tabletop/presentation.mjs';
import {validateScenes,validateTimeline} from '../../../../scripts/validate-data.mjs';
const directory=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(directory,'../../../..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8')),hash=b=>createHash('sha256').update(b).digest('hex');
export const template=read('chapters/01-four-elements/editorial/zombie-kingdom-r2/blocks.template.json');
export function spokenScore(value){
 if(!Number.isInteger(value)||value<0||value>99)throw Error('Scores must be integer 0..99.');
 const digits='零一二三四五六七八九';if(value<10)return digits[value];
 return (value>=20?digits[Math.floor(value/10)]:'')+'十'+(value%10?digits[value%10]:'');
}
export function resolveDraft({scene,presentation,timeline,sourceHash}){
 validateScenes(scene);validateTimeline(timeline,scene);const view=presentationModel(presentation,scene);
 const words={A:view.actors.A.name,B:view.actors.B.name,series:presentation.series,red:scene.strategies[0].label,blue:scene.strategies[1].label};words.gameLabel=words.red+words.blue+'牌局';
 const values=Object.fromEntries(['RR','RB','BR','BB'].map((key,i)=>[key,scene.payoffs[Math.floor(i/2)][i%2]]));
 for(const [cell,pair] of Object.entries(values)){
  words[`pair.${cell}`]=`（${pair.join('，')}）`;
  for(const [i,id] of ['A','B'].entries())words[`score.${cell}.${id}`]=spokenScore(pair[i]);
  words[`joint.${cell}`]=pair[0]===pair[1]?`各得${spokenScore(pair[0])}分。`:`${words.A}得${spokenScore(pair[0])}分，${words.B}得${spokenScore(pair[1])}分。`;
 }
 const resolve=text=>text.replace(/\{\{([^}]+)\}\}/g,(_,key)=>{if(!(key in words))throw Error(`Unknown editorial token ${key}`);return words[key]});
 const resolveDeep=value=>typeof value==='string'?resolve(value):Array.isArray(value)?value.map(resolveDeep):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,value])=>[key,resolveDeep(value)])):value;
 const blocks=template.blocks.map(block=>({...resolveDeep(block),timing:null}));
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
