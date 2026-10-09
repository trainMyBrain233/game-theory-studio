import {productionPalette} from './palette.mjs';
import {readJSON,validateScenes,validateFirstEpisodeTimeline,validateSchema} from '../../scripts/validate-data.mjs';
import Ajv2020 from 'ajv/dist/2020.js';

const read=relative=>readJSON(new URL(relative,import.meta.url));
export const sceneData=read('../../design/scenes.json');
const design=read('../../design/tokens.json');
validateScenes(sceneData);validateSchema('tokens',design);
export const timeline=read('../../chapters/01-four-elements/narration/timeline.json');
validateFirstEpisodeTimeline(timeline,sceneData);
const ajv=new Ajv2020({allErrors:true,strict:true});
export const CAST=read('../cast.json');
const validateCast=ajv.compile(read('../schema/cast.schema.json'));
if(!validateCast(CAST))throw Error(`Production cast schema: ${JSON.stringify(validateCast.errors)}`);
for(const actor of sceneData.actors)CAST.actors[actor.id].display_name=actor.label;
for(const strategy of sceneData.strategies)CAST.strategies[strategy.id].label=strategy.label;
export function resolveCastText(text) {
  const names=Object.fromEntries(sceneData.actors.map(actor=>[actor.label,CAST.actors[actor.id].display_name]));
  const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  // Match tokens and legacy aliases in the original input in one pass.
  // A replacement may itself contain an alias; never expand that output again.
  const matcher=new RegExp('\\{\\{(A|B|red|blue)\\}\\}|'+Object.keys(names).sort((a,b)=>b.length-a.length).map(escape).join('|'),'g');
  return String(text).replace(matcher,(match,id)=>id===undefined?names[match]:CAST.actors[id]?.display_name??CAST.strategies[id].label);
}
export const content=read('../content.json');
const validateContent=ajv.compile(read('../schema/content.schema.json'));
if(!validateContent(content))throw Error(`Production content schema: ${JSON.stringify(validateContent.errors)}`);
if(JSON.stringify(content.chapter_order)!==JSON.stringify(timeline.sections.map(section=>section.id)))throw Error('Production scene order differs from the canonical timeline.');
content.case_id=sceneData.caseId;content.case_title=sceneData.caseName;
content.matrix={row_actor:'A',column_actor:'B',score_order:['A','B'],strategy_order:sceneData.strategies.map(strategy=>strategy.id),values:sceneData.payoffs};
export const TOKENS=read('../tokens.json');
const validateTokens=ajv.compile(read('../schema/tokens.schema.json'));
if(!validateTokens(TOKENS))throw Error(`Production token schema: ${JSON.stringify(validateTokens.errors)}`);
const palette=design.styles.textbook;
TOKENS.colors=productionPalette(design,read('../assets/asset-hotspots.json').cards.labelStyle.fill);
TOKENS.type.subtitle=design.canvas.subtitleFont;
TOKENS.titleFamily=palette.titleFamily;
