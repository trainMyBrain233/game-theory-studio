import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCanvas, GlobalFonts} from '@napi-rs/canvas';
import {createHash} from 'node:crypto';
import {registerFonts, canvasFont, FONT_FAMILY, SERIF_FAMILY, CJK_REGRESSION} from './fonts.mjs';
import {assertAppliedFont} from './font-contract.mjs';
import {chapterDirectories} from '../scripts/chapters.mjs';
import {currentGlyphInventory} from './glyph-inventory.mjs';
import {currentPresentationTextRuns} from './text-inventory.mjs';
import {comparisonBoardTextPlan} from '../design/comparison-board-text.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
assert.equal(process.env.DISABLE_SYSTEM_FONTS_LOAD, '1', 'Use the isolated-fonts preload');
assert.throws(() => canvasFont(32), /registerFonts/);
registerFonts({serif: true});
for (const family of [FONT_FAMILY, SERIF_FAMILY]) {
  const registered = GlobalFonts.families.find(x => x.family === family);
  assert(registered, `Missing family: ${family}`);
  assert([400, 700].every(w => registered.styles.some(s => s.weight === w)));
}
assert.throws(() => canvasFont(32, 500), /registered weight/);
const out = path.join(HERE, 'qa');
fs.mkdirSync(out, {recursive: true});
const canvas = createCanvas(1920, 560), ctx = canvas.getContext('2d');
ctx.fillStyle = '#FFFEF8'; ctx.fillRect(0, 0, 1920, 560);
ctx.fillStyle = '#243E66'; ctx.textBaseline = 'middle';
const lines = [
  '博弈论入门 参与者 信息 策略 收益（支付）',
  '每种组合，各得什么？选择 规则 红 蓝 小A 小B',
  '0，3，5；公开规则 ≠ 看见当前选择 → 得分 ↑'
];
let y = 50;
for (const serif of [false, true]) for (const weight of [400, 700]) {
  ctx.font = canvasFont(34, weight, {serif});
  assertAppliedFont(ctx,{size:34,weight,family:serif?SERIF_FAMILY:FONT_FAMILY});
  const glyph = ctx.measureText('博');
  assert(glyph.actualBoundingBoxAscent + glyph.actualBoundingBoxDescent > 24, 'SC glyph should have a readable physical extent');
  const text = `${serif ? 'Serif' : 'Sans'} SC ${weight}：${lines[0]}`;
  assert(ctx.measureText(text).width < 1800);
  ctx.fillText(text, 60, y); y += 64;
}
// Same text, position and background: the weight/family alone must change glyph pixels.
const glyphHashes=new Map();
for(const serif of [false,true])for(const weight of [400,700]){
 const proof=createCanvas(640,96),context=proof.getContext('2d');
 context.font=canvasFont(48,weight,{serif});
 assertAppliedFont(context,{size:48,weight,family:serif?SERIF_FAMILY:FONT_FAMILY});
 context.fillStyle='#243E66';context.fillText('博弈论 参与者 0,5',16,64);
 glyphHashes.set(`${serif}/${weight}`,createHash('sha256').update(proof.data()).digest('hex'));
}
for(const serif of [false,true])assert.notEqual(glyphHashes.get(`${serif}/400`),glyphHashes.get(`${serif}/700`),'Regular and bold must render different glyph pixels');
for(const weight of [400,700])assert.notEqual(glyphHashes.get(`false/${weight}`),glyphHashes.get(`true/${weight}`),'Sans and Serif must render different glyph pixels');
ctx.font = canvasFont(36, 700);
for (const text of lines.slice(1)) { ctx.fillText(text, 60, y); y += 74; }
fs.writeFileSync(path.join(out, 'sc-specimen.png'), canvas.toBuffer('image/png'));
const scenes = JSON.parse(fs.readFileSync(path.join(HERE, '../design/scenes.json')));
const timelines = chapterDirectories().map(directory => JSON.parse(fs.readFileSync(path.join(directory, 'narration/timeline.json'), 'utf8')));
const {drawScene, TOKENS, DATA} = await import('../design/render-proposals.mjs');
const templateRuns=[];
for(const style of Object.keys(TOKENS.styles))for(const scene of DATA.frames)templateRuns.push(...drawScene(createCanvas(1920,1080),style,scene.id).map(b=>b.text));
const comparisonRuns=Object.values(TOKENS.styles).flatMap(style=>comparisonBoardTextPlan(style).map(run=>run.text));
const textRuns = [currentGlyphInventory().characters.join(''), ...templateRuns, ...comparisonRuns, ...currentPresentationTextRuns(), CJK_REGRESSION, ...lines,
  ...scenes.frames.flatMap(f => [f.title, f.lead, f.subtitle, f.section]),
  ...timelines.flatMap(timeline => [timeline.title, ...timeline.segments.flatMap(s => [s.text, s.voiceover]), ...timeline.sections.map(s => s.title)])];
fs.writeFileSync(path.join(out, 'text-runs.json'), JSON.stringify({textRuns}, null, 2) + '\n');
console.log('Font runtime: applied SC family/size/400/700 asserted; identical-text weight/family pixels differ; no system-font loading; specimen rendered.');
