/** Shared raster copy: rendering and glyph QA consume the same authored text. */
import {VARIANTS} from './layout.mjs';
import {identityTextPlan} from './text-layout.mjs';

export const DISPLAY_TEXT=Object.freeze({
 tabletopHeader:'桌牌支撑原型 · 公共原创头像',
 supportNote:'只比较桌面 / 支撑 / 落点；真实手势与接触待验',
 stageNote:'阶段接口：idle → reach → grasp → place（先接触承托）→ release；静态手不代表已验动作。',
 identityHeader:'人物 → 头像 → 收益矩阵',
 identityTitle:'同一角色，从人物一直读到数对',
 identityNote:'公共预览使用原创人物头部；真实生产复用批准头层，包含完整路障轮廓。',
 identityFooter:'身份接口草稿 · 字号固定 · 新口播与时间轴待修订',
 identityReviewNote:'真实头层与矩阵净空仍需实际像素验收',
 interactionHeader:'原创几何取放验证 · 真实手图未接入',
 interactionTitle:'先夹住，再抬牌；先放稳，再松手',
 interactionNote:'同一张牌 / 同一腕点 / 前后手层夹牌 / 明确牌槽承托',
 interactionReviewNote:'几何动作示意；真实握姿、腕缝与自然度未验',
});
export const INTERACTION_PHASES=Object.freeze({idle:'放松停留',approach:'靠近',contact:'接触闭合',hold:'夹持抬起',place:'落放并停稳',release:'牌交桌面后松指',retreat:'手退回桌面'});
export const candidateHeader=view=>`${view.headerLines[1]}（候选）`;
export const comparisonHeading=variant=>`${variant.title} / 同镜头停留与放回 / 公共原创占位`;
export const tabletopStatus=state=>`${state.time.toFixed(1)}s · ${state.phase} · 手姿未注册`;
export const interactionStatus=state=>`${state.time.toFixed(1)}s · ${INTERACTION_PHASES[state.phase]}`;

export function presentationTextRuns(view) {
 return [
  ...Object.values(DISPLAY_TEXT),view.header,...view.headerLines,candidateHeader(view),
  ...Object.values(view.actors).map(actor=>actor.name),
  ...identityTextPlan(view).map(item=>item.text),
  ...view.scene.strategies.map(strategy=>strategy.label),
  ...view.matrix.values.flat().map(pair=>`(${pair.join(', ')})`),
  ...VARIANTS.flatMap(variant=>[variant.title,variant.note,comparisonHeading(variant)]),
  ...['idle','reach','grasp','place','release'].map(phase=>tabletopStatus({time:0,phase})),
  ...Object.keys(INTERACTION_PHASES).map(phase=>interactionStatus({time:0,phase})),
  '0123456789', // Time/score fields can display every decimal digit.
 ];
}
