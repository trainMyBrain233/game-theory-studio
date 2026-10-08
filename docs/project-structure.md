# 工程与配置契约

## 目录和来源

| 目录/文件 | 职责 | 更新入口 |
| --- | --- | --- |
| `design/scenes.json` | 两参与者、两策略、四格收益、选择、模板文案 | 内容配置；不要复制收益常量到图示 |
| `design/tokens.json` | 固定模板几何声明、颜色、字幕字号与标题字体 | 受 Schema 约束的视觉配置 |
| `design/render-proposals.mjs` | A/B/C 两类原创静帧 | 保留相对导入与当前布局 |
| `chapters/<id>/chapter.json` | 章节身份、内容版本和原型状态 | 元数据；目录名与 id 相同 |
| `chapters/<id>/narration/build_narration.py` | 人工语义块与参考时长 | 本章内容源；从共享案例读取名字/收益 |
| `chapters/<id>/narration/{timeline.json,*.srt,*.txt}` | 可读的派生文本交付 | `build:narration` 重建，随源码审查 |
| `templates/chapter/` | 两段原创章节脚手架 | 更新模板后，新章节使用新模板；旧章不自动覆盖 |
| `scripts/`、`tests/` | 跨平台运行、验证、脚手架、负向回归 | npm 命令入口 |
| `typography/` | 完整 SC 字体准备/注册 | 字体二进制和 manifest 只存本地 |
| `assets/characters/` | A/B 通用接口，原创历史提案归档 | 最终第三方角色图像由仓库外生产流程管理 |
| `production/` | 六节时间线、动作、私有RGBA适配、原创占位SVG和整集QA | 根目录 `test:episode` / `render:episode:*`；共用根案例/时间轴/字体 |
| `requirements-media.txt` | 可选原创音效/联系图工具 | `setup:media`；NumPy/Pillow精确版本 |
| `project-status.json` | 当前原型/生产状态 | 人工核对状态，不能把 QA 通过当整片完成 |
| `.github/workflows/quality.yml` | Linux/macOS 最小权限 CI | 当前源码验证；不发布任何内容 |

## Schema 与支持范围

根目录 Schema 为 JSON Schema draft-07；production 的 cast/content/tokens 为 draft2020-12，均由 Ajv strict 模式验证；未知顶层字段报错。Schema 结构验证之外还有跨文件语义检查。

| Schema | 当前版本/范围 |
| --- | --- |
| `scenes.schema.json` | `schemaVersion: 1.0`；固定角色 id A/B、策略 id red/blue、2×2 矩阵；可改显示名、策略名、0–99 整数收益、默认选择、模板文案 |
| `tokens.schema.json` | `schemaVersion: 1.0`；可改合法 RGB 颜色、字幕 38–48px、正文 36–42px、每风格标题 sans/serif；当前原生几何、角色形状和字重是固定合同，修改会明确报错 |
| `chapter.schema.json` | `schemaVersion: 1.0`；`NN-slug` id、SemVer 内容版本、B 风格、当前案例；阶段字段保留后续阶段，但 Schema 2.0 的参考时间轴只能标为 prototype |
| `timeline.schema.json` | `schema_version: 2.0`；人工口播参考；语义块、章节、选择/收益事件及玩家引用；当前不接受“已按音频对齐”声明 |

production cast 1.1 不重复名字，content 2.1 不重复收益矩阵，tokens 1.0 固定六节布局；验证未知字段、身份形状、共享来源、六节顺序和固定布局。实际案例/时间轴/字体来自根目录，新增章节脚手架仅生成内容原型，不自动生成新整集动画。完整字段见 [生产模块](../production/README.md)。

角色显示名最多 4 字符，策略名最多 2 字符；这是当前静帧的有限排版范围，不是任意长度文本支持。渲染进一步检查实际字形边界/碰撞。长标题或说明在可用位置最多两行；不能排下时明确失败，不偷偷缩小字号。场景文案可用 `{actorA}`、`{actorB}` 绑定显示名；收益场景字幕与读法按当前选择自动生成。

选择的优先级：基础场景 → `override.data.selected` → 显式 `override.selected`。A 始终为行，B 始终为列；每格数对按 A/B 排列。红/蓝 id 是策略颜色/形状身份，显示名可以为“合作/退出”；它们不是角色身份。

本例所有参与者目标仍为“自己的得分更高”，属于当前模板合同。一般博弈、更多参与者、负数/小数收益、第三策略或不同目标需要先定义新合同，不用未验证的数据硬塞进此模板。

## 版本与更新流程

1. 项目工程版本用 `package.json`；章节内容版本用 `chapter.json.contentVersion`；它们与配置 Schema 版本相互独立。
2. 修改公共字段的意义、形状或允许范围时，更新相应 Schema 版本和消费者，记录迁移，提供旧/新与错误输入回归。颜色、支持范围内的文字/收益变化不需要升 Schema。
3. 章节内容修改先编辑案例配置/人工生成器，再递增内容版本。运行 `npm run build:narration -- <id>`，或省略 id 重建全部章节。
4. 审查 timeline/SRT/口播文字 diff，运行 `qa:data`。该命令在临时目录重建后逐字节比较，不写回被检查文件。
5. 运行 `npm test`，查看字形/净空/数值和字幕断句。显示名/策略/收益变化会更新口播并在必要时延长人工参考窗，仍要真人试听后重新对齐。
6. 新章节先保持 prototype；只有实际音频、完整导出与对应检查证据齐全，才建立新的对齐合同和修改生产状态。`00-original-example` 与几何烟测不增加正片完成度。

## 本地产物

`design/frames/`、`design/boards/`、`design/qa/`、`typography/fonts/`、`typography/qa/`、章节 `narration/qa/` 、`production/output/`、`production/qa/*.json`、`production/narration/exports/` 与 `artifacts/smoke/` 均忽略。报告可记录当次时间，但渲染本身只依赖内容、字体、平台和显式时间输入；不要保存机器绝对路径到公开源码。
