import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {createCanvas} from '@napi-rs/canvas';
import {drawFrame,timeline,content,DURATION} from '../src/scenes.mjs';
import {CAST,resolveCastText} from '../src/cast.mjs';
import {prepareAssets,C} from '../src/primitives.mjs';
const checks=[];function check(label,fn){fn();checks.push({label,pass:true})}
check('Contiguous whole-clause timeline',()=>{let end=0;for(const s of timeline.segments){assert.ok(Math.abs(s.start-end)<.001);assert.ok(s.end>s.start);assert.ok(s.voiceover_end<=s.end);assert.ok(Math.abs(s.end-s.voiceover_end-s.pause_after)<.001);assert.ok(s.lines.length<=2);end=s.end;}assert.equal(end,DURATION)});
check('Exactly four matrix cells, A row/B column and ordered scores',()=>{assert.equal(content.matrix.row_actor,'A');assert.equal(content.matrix.column_actor,'B');assert.deepEqual(content.matrix.score_order,['A','B']);assert.deepEqual(content.matrix.values,[[[3,3],[0,5]],[[5,0],[1,1]]]);for(const key of ['RR','RB','BR','BB']){const a=timeline.segments.find(s=>s.visual_cue.action==='highlight_choices'&&s.visual_cue.matrix_cell===key),b=timeline.segments.find(s=>s.visual_cue.action==='reveal_scores'&&s.visual_cue.matrix_cell===key);assert.equal(a.end,b.start);assert.deepEqual(b.visual_cue.scores,timeline.visual_contract.matrix_values[key]);}});
check('Cast tokens resolve consistently',()=>{for(const s of timeline.segments){assert.ok(!resolveCastText(s.text).includes('{{'));assert.ok(!resolveCastText(s.voiceover).includes('{{'));}assert.deepEqual(Object.keys(CAST.actors),['A','B']);});
const luminance=hex=>{let v=hex.replace('#','').match(/../g).map(h=>parseInt(h,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return v[0]*.2126+v[1]*.7152+v[2]*.0722};const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
check('Main and secondary text contrast >= 7:1',()=>{assert.ok(contrast(C.ink,C.paper)>=7);assert.ok(contrast(C.muted,C.paper)>=7)});
check('Editable vector props and truthfully declared raster actors',()=>{
 for(const reg of Object.values(CAST.strategies)){const s=fs.readFileSync(new URL('../'+reg.asset,import.meta.url),'utf8');assert.match(s,/<svg/);assert.ok(!/<image|<script|<foreignObject/i.test(s));assert.match(s,/<path|<rect|<circle/);}
 for(const reg of Object.values(CAST.actors)){if(reg.asset_type==='layered_raster'&&!process.argv.includes('--placeholder-cast')){assert.match(reg.asset,/\.png$/);assert.equal(fs.readFileSync(new URL('../'+reg.asset,import.meta.url)).subarray(1,4).toString(),'PNG');}else if(process.argv.includes('--placeholder-cast')){assert.match(reg.fallback_asset,/\.svg$/);}else{assert.match(reg.asset,/\.svg$/);}}
});
await prepareAssets(1.15);const cv=createCanvas(1920,1080);const hash=t=>{drawFrame(cv,t);return crypto.createHash('sha256').update(cv.data()).digest('hex')};
check('Rendering is deterministic at four representative times',()=>{for(const t of [27,38.2,83,126.3])assert.equal(hash(t),hash(t))});
const report={checks,contrast:{primary:contrast(C.ink,C.paper),secondary:contrast(C.muted,C.paper)},timing_status:timeline.timing_status,cast_status:CAST.status};fs.writeFileSync(new URL('semantic_checks.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
