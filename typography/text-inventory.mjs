/** Current authored presentation/editorial text; resolving never writes products. */
import fs from 'node:fs';
import {presentationModel} from '../design/experiments/tabletop/presentation.mjs';
import {presentationTextRuns} from '../design/experiments/tabletop/display-text.mjs';
import {currentProducts} from '../chapters/01-four-elements/editorial/zombie-kingdom-r2/build.mjs';

const strings=value=>typeof value==='string'?[value]:value&&typeof value==='object'?Object.values(value).flatMap(strings):[];
export function currentPresentationTextRuns() {
 const read=relative=>JSON.parse(fs.readFileSync(new URL(relative,import.meta.url),'utf8'));
 const view=presentationModel(read('../design/experiments/tabletop/presentation.json'),read('../design/scenes.json'));
 // Read-time expansion uses today's labels, strategies and scores, rather than
 // stale generated JSON or an implicit rebuild of tracked editorial products.
 const editorial=Object.entries(currentProducts()).flatMap(([filename,text])=>filename.endsWith('.json')?strings(JSON.parse(text)):[text]);
 return [...new Set([...presentationTextRuns(view),...editorial])];
}
