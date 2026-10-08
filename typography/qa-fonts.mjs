import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCanvas, GlobalFonts} from '@napi-rs/canvas';
import {registerFonts, canvasFont, FONT_FAMILY, SERIF_FAMILY, CJK_REGRESSION} from './fonts.mjs';
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
  const text = `${serif ? 'Serif' : 'Sans'} SC ${weight}：${lines[0]}`;
  assert(ctx.measureText(text).width < 1800);
  ctx.fillText(text, 60, y); y += 64;
}
ctx.font = canvasFont(36, 700);
for (const text of lines.slice(1)) { ctx.fillText(text, 60, y); y += 74; }
fs.writeFileSync(path.join(out, 'sc-specimen.png'), canvas.toBuffer('image/png'));
const scenes = JSON.parse(fs.readFileSync(path.join(HERE, '../design/scenes.json')));
const timeline = JSON.parse(fs.readFileSync(path.join(HERE, '../chapters/01-four-elements/narration/timeline.json')));
const {drawScene, TOKENS, DATA} = await import('../design/render-proposals.mjs');
const templateRuns=[];
for(const style of Object.keys(TOKENS.styles))for(const scene of DATA.frames)templateRuns.push(...drawScene(createCanvas(1920,1080),style,scene.id).map(b=>b.text));
const textRuns = [...templateRuns, CJK_REGRESSION, ...lines,
  ...scenes.frames.flatMap(f => [f.title, f.lead, f.subtitle, f.section]),
  ...timeline.segments.flatMap(s => [s.text, s.voiceover]),
  ...timeline.sections.map(s => s.title)];
fs.writeFileSync(path.join(out, 'text-runs.json'), JSON.stringify({textRuns}, null, 2) + '\n');
console.log('Font runtime: explicit SC Sans/Serif; real 400/700 weights; no system-font loading; specimen rendered.');
