/** Native-free current glyph repertoire, shared by preparation and registration.
 * Authored JSON strings cover dynamic names/strategies/scores; source text is a
 * conservative superset of renderer literals (including interpolated copy).
 * Authored JSON inputs are explicitly listed; generated QA/review JSON is never
 * an input. No native font-aware renderer is imported.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const trees=['design','production/src','assets/characters/archive/proposals'];
const singles=['design/scenes.json','design/tokens.json','design/experiments/tabletop/presentation.json',
 'assets/characters/archive/proposals/cast.json','assets/characters/archive/proposals/proposals.json',
 'production/content.json','production/cast.json','production/tokens.json','production/make_contact_sheets.py',
 'typography/fonts.mjs','typography/qa-fonts.mjs','chapters/01-four-elements/editorial/zombie-kingdom-r2/build.mjs',
 'chapters/01-four-elements/editorial/zombie-kingdom-r2/blocks.template.json'];
const strings=value=>typeof value==='string'?[value]:value&&typeof value==='object'?Object.values(value).flatMap(strings):[];
let cached;
function walk(directory,accept){
 return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  const file=path.join(directory,entry.name);
  return entry.isDirectory()?walk(file,accept):accept(file)?[file]:[];
 });
}
export function currentGlyphInventory(){
 const files=[...trees.flatMap(tree=>walk(path.join(ROOT,tree),file=>file.endsWith('.mjs'))),
 ...fs.readdirSync(path.join(ROOT,'chapters'),{withFileTypes:true}).filter(entry=>entry.isDirectory()).flatMap(entry=>
  ['chapter.json','narration/timeline.json'].map(file=>path.join(ROOT,'chapters',entry.name,file))),
 ...singles.map(file=>path.join(ROOT,file))].sort();
 const entries=[...new Set(files)].map(file=>[path.relative(ROOT,file),fs.readFileSync(file,'utf8')]);
 const signature=createHash('sha256').update(JSON.stringify(entries)).digest('hex');
 if(cached?.signature===signature)return cached;
 const textRuns=entries.flatMap(([file,text])=>file.endsWith('.json')?strings(JSON.parse(text)):[text]);
 // Include runtime numeric formatting even when a digit is absent from today's case.
 textRuns.push('0123456789');
 const characters=[...new Set(textRuns.flatMap(text=>[...text]).filter(c=>!/^\s$/u.test(c)))].sort((a,b)=>a.codePointAt(0)-b.codePointAt(0));
 cached=Object.freeze({signature,characters:Object.freeze(characters)});
 return cached;
}
if(process.argv[1]===fileURLToPath(import.meta.url))process.stdout.write(JSON.stringify(currentGlyphInventory()));
