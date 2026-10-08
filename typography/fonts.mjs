/** Explicit Simplified Chinese faces. Never alias a multi-face TTC to SC.
 * Import this module before any renderer creates a canvas.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {GlobalFonts} from '@napi-rs/canvas';
export const FONT_FAMILY='GameTheory Noto Sans SC';
export const SERIF_FAMILY='GameTheory Noto Serif SC';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const loadedFamilies=new Set();
export function registerFonts({serif=false}={}) {
  const entries=[['Sans',FONT_FAMILY],...(serif?[['Serif',SERIF_FAMILY]]:[])];
  for(const [kind,family] of entries) {
    if(!GlobalFonts.has(family))for(const weight of ['Regular','Bold']) {
      const file=path.join(ROOT,'fonts',`Noto${kind}CJKSC-${weight}.otf`);
      if(!fs.existsSync(file))throw new Error(`Required SC font is missing: ${file}`);
      if(!GlobalFonts.registerFromPath(file,family))throw new Error(`SC font registration failed: ${file}`);
    }
    const entry=GlobalFonts.families.find(x=>x.family===family);
    const weights=entry?.styles.map(x=>x.weight)||[];
    if(![400,700].every(x=>weights.includes(x)))throw new Error(`Expected real 400/700 weights in ${family}`);
  }
  for(const [,family] of entries)loadedFamilies.add(family);
  return {sans:FONT_FAMILY,serif:serif?SERIF_FAMILY:null};
}
// Only ask for available weights: no platform-specific 500/600/800 matching.
export function canvasFont(px,weight=400,{serif=false}={}) {
  if(!loadedFamilies.has(serif?SERIF_FAMILY:FONT_FAMILY))throw new Error('Call registerFonts() for the requested family before drawing text.');
  if(![400,700].includes(weight))throw new Error('Use a registered weight (400 or 700), or add a genuine font file first.');
  return `${weight} ${px}px "${serif?SERIF_FAMILY:FONT_FAMILY}"`;
}
export const TYPOGRAPHY_1080P={
  title:{size:60,weight:700},section:{size:42,weight:700},body:{size:33,weight:400},
  label:{size:30,weight:700},caption:{size:24,weight:400},subtitle:{size:38,weight:400},
  minContrastNormal:4.5,minContrastSmall:7,minStrokePx:2,
};
export const CJK_REGRESSION='博弈论入门 参与者 信息 策略 收益（支付） 每种组合，各得什么？ 选择 规则 红 蓝 小A 小B 0，3，5；公开规则 ≠ 看见当前选择 → 得分 ↑';
