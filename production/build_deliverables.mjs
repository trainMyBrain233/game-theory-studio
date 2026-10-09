import {writeProducts} from '../scripts/publish-products.mjs';
import {timeline} from './src/model.mjs';
import {resolveCastText,CAST} from './src/cast.mjs';
import {subtitleMilliseconds,subtitleStamp,subtitleWindows} from './src/subtitle-time.mjs';
const windows=subtitleWindows(timeline.segments);
const stamp=t=>subtitleStamp(subtitleMilliseconds(t));
const srt=timeline.segments.map((s,i)=>`${i+1}\n${subtitleStamp(windows[i].start)} --> ${subtitleStamp(windows[i].end)}\n${resolveCastText(s.text)}\n`).join('\n');
let script=`Game Theory Studio · 四个问题，看懂一场博弈\n\n口播参考稿（${timeline.duration}秒）\n${timeline.timing_notice}\n\n角色：${CAST.actors.A.display_name}（${CAST.actors.A.type_name||'A'}）；${CAST.actors.B.display_name}（${CAST.actors.B.type_name||'B'}）\n\n录音建议\n- 先把一句话说完整，再按语义换气，不必严格踩秒。\n- 读问句、概念定义和收益数字时，给听众留一点理解时间。\n- A/B角色身份和数对顺序固定；数字用中文念。\n- 字幕保留到显示窗结尾，尾部停顿已算进总时长。\n- 当前没有真人配音；录音后再调整字幕与图形动作时点。\n\n`;
for(const sec of timeline.sections){script+=`\n${sec.title}  ${stamp(sec.start)}–${stamp(sec.end)}\n\n`;for(const s of timeline.segments.filter(s=>s.section===sec.id))script+=`${stamp(s.start)}  ${resolveCastText(s.voiceover)}\n  建议说完：${stamp(s.voiceover_end)}；句后保留约${s.pause_after.toFixed(1)}秒。\n\n`;}
writeProducts('.',{
 'output/game_theory_v2_zh.srt':srt,
 'output/口播参考稿_无真人对齐.txt':script,
 'output/timeline_resolved.json':resolveCastText(JSON.stringify(timeline,null,2)),
 'narration/exports/game_theory_v2_zh.srt':srt,
 'narration/exports/口播参考稿_无真人对齐.txt':script,
});
console.log('Wrote cast-resolved SRT, voiceover script and timeline.');
