import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateFigure,validateFigurePixels,validateCard,validateAssetSource} from '../production/assets/validate-art.mjs';
const read=name=>fs.readFileSync(new URL(`../production/assets/${name}`,import.meta.url),'utf8');
const hotspots=JSON.parse(read('asset-hotspots.json'));

test('both public figures show connected foreground sleeves and no penetrating body outline',async()=>{
 for(const id of ['a','b'])assert.equal((await validateFigure(read(`person_${id}.svg`),id)).passed,true);
 assert.deepEqual(hotspots.figures.viewBox,[0,0,420,500]);assert.equal(hotspots.figures.deskBaseline,480);
 assert.deepEqual(hotspots.figures.badgeTextAnchor,[164,374]);
});
test('putting the real forearms behind the body loses their inward contour pixels',async()=>{
 for(const id of ['a','b']){
  let svg=read(`person_${id}.svg`);const group=svg.match(/    <g id="forearms"[\s\S]*?<\/g>/)[0];svg=svg.replace(group,'').replace(/    <path id="(?:shirt|blouse)-body"/,group+'\n$&');
  await assert.rejects(validateFigure(svg,id),/forearms\/cuffs\/hands in front/);
  await assert.rejects(validateFigurePixels(svg,id),/Visible inward forearm contour/);
 }
});
test('a misplaced side outline is rejected by rendered occlusion pixels even with valid group order',async()=>{
 const svg=read('person_a.svg').replace('    <g id="cuffs"','    <path d="M103 435 L103 465" fill="none"/>\n    <g id="cuffs"');
 await assert.rejects(validateFigure(svg,'a'),/Forearm fill occludes/);
});
test('both lowered card symbols and independent authored source hashes match real SVG bytes',async()=>{
 assert.deepEqual(hotspots.cards.symbolCenter,[70,73]);
 for(const name of Object.keys(hotspots.sourceHashes))assert.equal((await validateAssetSource(name,Buffer.from(read(name)),hotspots.sourceHashes[name])).art.passed,true);
 await assert.rejects(validateCard(read('card_red.svg').replace('cy="73"','cy="57"'),'red'),/Lowered circle/);
 await assert.rejects(validateCard(read('card_blue.svg').replace('y="64"','y="48"'),'blue'),/Lowered bar/);
 await assert.rejects(validateAssetSource('card_red.svg',Buffer.from(read('card_red.svg')+' '),hotspots.sourceHashes['card_red.svg']),/source hash differs/);
});
