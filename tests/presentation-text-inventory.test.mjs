import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {presentationModel} from '../design/experiments/tabletop/presentation.mjs';
import {DISPLAY_TEXT,INTERACTION_PHASES,candidateHeader,comparisonHeading,tabletopStatus,interactionStatus,presentationTextRuns} from '../design/experiments/tabletop/display-text.mjs';
import {VARIANTS} from '../design/experiments/tabletop/layout.mjs';
import {currentPresentationTextRuns} from '../typography/text-inventory.mjs';

const read=file=>JSON.parse(fs.readFileSync(new URL(file,import.meta.url),'utf8'));
const scene=read('../design/scenes.json'),config=read('../design/experiments/tabletop/presentation.json');
test('shared raster copy preserves the pre-extraction caption literals and formatted headers/statuses',()=>{
 assert.deepEqual(Object.values(DISPLAY_TEXT),[
  '桌牌支撑原型 · 公共原创头像','只比较桌面 / 支撑 / 落点；真实手势与接触待验',
  '阶段接口：idle → reach → grasp → place（先接触承托）→ release；静态手不代表已验动作。',
  '人物 → 头像 → 收益矩阵','同一角色，从人物一直读到数对','公共预览使用原创人物头部；真实生产复用批准头层，包含完整路障轮廓。',
  '身份接口草稿 · 字号固定 · 新口播与时间轴待修订','真实头层与矩阵净空仍需实际像素验收',
  '原创几何取放验证 · 真实手图未接入','先夹住，再抬牌；先放稳，再松手',
  '同一张牌 / 同一腕点 / 前后手层夹牌 / 明确牌槽承托','几何动作示意；真实握姿、腕缝与自然度未验',
 ]);
 assert.deepEqual(INTERACTION_PHASES,{idle:'放松停留',approach:'靠近',contact:'接触闭合',hold:'夹持抬起',place:'落放并停稳',release:'牌交桌面后松指',retreat:'手退回桌面'});
 assert.equal(candidateHeader({headerLines:['系列','第01集·标题']}),'第01集·标题（候选）');
 assert.equal(comparisonHeading({title:'桌上平放'}),'桌上平放 / 同镜头停留与放回 / 公共原创占位');
 assert.equal(tabletopStatus({time:3.25,phase:'grasp'}),'3.3s · grasp · 手姿未注册');
 assert.equal(interactionStatus({time:3.25,phase:'hold'}),'3.3s · 夹持抬起');
 const renderers=['render.mjs','render-interaction.mjs'].map(file=>fs.readFileSync(new URL('../design/experiments/tabletop/'+file,import.meta.url),'utf8')).join('\n');
 for(const key of Object.keys(DISPLAY_TEXT))assert(renderers.includes(`DISPLAY_TEXT.${key}`),`Unconsumed raster copy: ${key}`);
});
test('inventory covers current headers, actor names, matrix strategies/scores, variants and both renderers without mutating inputs',()=>{
 const current=structuredClone(config),caseData=structuredClone(scene);
 current.series='系列ع';current.episode.title='标题غ';current.actors.A.name='ع';current.actors.B.name='乙';
 caseData.strategies[0].label='合作';caseData.strategies[1].label='退出';caseData.payoffs=[[[11,12],[21,22]],[[31,32],[41,42]]];
 const before=JSON.stringify({current,caseData}),view=presentationModel(current,caseData),runs=presentationTextRuns(view);
 for(const text of ['系列ع',`第${current.episode.number}集·标题غ（候选）`,'ع','乙','乙选哪张牌（列）','选合作（行）','选退出（行）','数对顺序：ع，乙','(11, 12)','(41, 42)',
  ...Object.values(DISPLAY_TEXT),...VARIANTS.flatMap(variant=>[variant.title,variant.note]),'0.0s · release · 手姿未注册','0.0s · 手退回桌面'])assert(runs.includes(text),`Missing rendered text: ${text}`);
 assert.equal(JSON.stringify({current,caseData}),before);
});
test('current inventory includes freshly resolved editorial voiceover and recording labels',()=>{
 const runs=currentPresentationTextRuns();
 assert(runs.includes(`${config.actors.A.name}选的牌，决定看哪一行。`));
 assert(runs.includes(`${config.actors.B.name}选的牌，决定看哪一列。`));
 assert(runs.includes(`矩阵左侧放${config.actors.A.name}小头像和全名；高亮${scene.strategies[0].label}${scene.strategies[1].label}两行标签。`));
});
