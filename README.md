# Game Theory Studio

中文博弈论视频制作基础工程：可检查的案例配置、人工口播时间轴、明确 SC 字体、可复用静帧模板和整集时间线渲染器。

## 当前状态

- **视觉方向 B「清爽教材」**：暖白底、深蓝字线、固定收益矩阵。A/C 保留为同内容回归样例。
- 已实现两参与者/两策略/2×2 收益矩阵、显示名和选择驱动的说明、两类静帧模板、字幕/口播生成与检查、原创章节脚手架、六节整集渲染器和双平台 CI。
- 第一章是 **174.1 秒、37 个语义块的人工口播参考**，没有真人配音，尚未按音频对齐；可生成仅轻音效预览。`00-original-example` 是 9 秒、两段原创测试例，不计入正片。
- 生产角色方向为 **PvZ 高清分层位图 + 独立绘制的文字/矩阵**；普通僵尸A/路障僵尸B的真实分层视觉预览已在云端私下生成并验收，素材与影片仍由仓库外生产流程管理。EA 图像、重绘角色、截图、字体二进制和视频不放此公开 MIT 仓库。PNG 包进 SVG 仍是位图，不能称为矢量。
- 云端已从 `f694678` 的干净 checkout 使用统一命令和八个私有RGBA层输出173.3秒1080p视觉预览，5199帧完整解码通过；与此前独立189帧/37字幕窗验收版的MP4及14张关键帧逐字节一致。此为私有素材的视觉验收回报，不是公开CI，也没有真人配音/实际音频对齐；本轮修复后还需绑定新head重新验证，未记录未知新hash。
- 完整时间线代码可执行，公开模式使用原创人物，`test:episode` 验证中间布局与关键帧；当前仓库的模板检查、占位角色与原创几何烟测**不是完整 V2 影片验收**。机器状态见 [project-status.json](project-status.json)，实际范围见 [验证记录](docs/validation.md)。

## 开始使用

当前工程仍在 [草稿PR #2](https://github.com/trainMyBrain233/game-theory-studio/pull/2) 的评审分支，`main` 未合并，仅含原MIT LICENSE。首次获取需明确检出工程分支（或对应评审分支）：

```sh
git clone --branch infra/quality-pipeline https://github.com/trainMyBrain233/game-theory-studio.git
cd game-theory-studio
```

Node 22+、npm、Python 3.10+；CI 固定 Node 24.19.0 / Python 3.12 系列。macOS/Linux 从仓库根目录运行同一组命令：

```sh
npm ci --ignore-scripts
npm run setup:python
npm run setup:fonts -- --download
npm test
```

`setup:python` 创建项目 `.venv` 并安装精确版本 requirements；后续 npm 命令自动选它，不需要激活或全局安装。`PYTHON` 可显式选择解释器。Canvas 使用当前平台的预编译 optional dependency，不要加 `--omit=optional`。

字体只使用完整 Noto CJK SC 2.004/2.003、真实 400/700。`--download` 对缺失/无效目标优先下载固定官方 commit 的 OTF，核验 SHA256，失败保留原目标；复用缓存仍核对固定SHA；`--verify-only` 不改manifest。本地TTC提取走独立来源指纹与重提合同，不能冒称下载OTF的固定SHA。已有固定官方OTF或完整同版本TTC可离线运行：

```sh
npm run setup:fonts -- --source-dir /path/to/noto-fonts
npm run qa:fonts
```

详情见 [字体说明](typography/README.md) 和 [故障排查](docs/troubleshooting.md)。字体、node_modules、PNG、视频、本机 manifest/QA 报告均不提交。

## 验证与制作命令

| 命令 | 内容 |
| --- | --- |
| `npm ci --ignore-scripts` | 干净、锁版本 npm 依赖安装 |
| `npm run setup:python` | 项目 Python 环境与 fontTools |
| `npm run setup:fonts -- --download` | 官方完整 SC 字体准备；离线可用 `--source-dir` |
| `npm run qa:data` | scenes/tokens/所有章节 Schema、语义/收益/时间窗、临时重建逐字节比较；不覆写被检查文件 |
| `npm run test:core` | 配置/选择/得分/暂停负向样本、只读 QA、非 UTF-8 locale、生成失败保留与字体恢复 |
| `npm run qa:fonts` | 明确SC家族/400/700、实际ctx.font字号/字重/完整家族、同字像素差异、篡改缓存/manifest负例与所有章节字符覆盖 |
| `npm run test:render` | 重建 6 静帧/3 对照板、53 基础检查、15状态文字边界/碰撞、归档只读比较与角色净空；包含合法更章复用回归 |
| `npm run test:case-reuse` | 隔离副本更改中文姓名/策略/不对称收益/默认BR；真实重建、内容/核心/设计/布局/归档QA通过，录音说明无旧例残留 |
| `npm run render:smoke` | 12 个变异矩阵、4 选牌状态、48px/宋体实际像素、原创几何 0/0.5/1s 确定性 |
| `npm run test:episode` | 整集Schema/语义、633布局采样、4格变更案例实际像素/字形、字体与5 SVG、导出文本与5张1080p占位帧 |
| `npm run render:episode:preview -- --placeholder-cast` | 13秒原创占位视频预览，需FFmpeg；整片/4K/音效/联系图命令见生产模块 |
| `npm run pack:source` | Git checkout公开源码归档；manifest含真实commit/dirty、分发类型、项目/Schema/章节版本、逐文件SHA256；CRC/边界检查通过后写回 |
| `npm run qa:source` | 候选源码中的常见秘密、私有路径、二进制、嵌入图片 SVG 和过大文件 |
| `npm test` | 上述自动检查；需先准备字体，编码/音效不属于默认CI |
| `npm run build:narration -- <id>` | 只重建指定章节；省略 id 重建全部 |
| `npm run build:cast` | 显式重建归档9 SVG/2 JSON及PNG；先审查生成器，QA失败不会代替用户覆盖编辑 |
| `npm run test:font-mutations -- --full-pipeline` | 隔离副本强制regular/8px/Sans负例；确认完整npm test在实际字重断言处失败 |
| `npm run chapter:new -- 02-example "章节标题"` | 创建原创两段原型章节，不覆盖已有章节 |

整集制作/配置与素材模式见 [production/README](production/README.md)。视频编码需要外部 FFmpeg/libx264；可选 `setup:media` 安装固定 NumPy/Pillow，用于原创音效和联系图。

开发/完整测试使用上面的`git clone`入口。公开ZIP只用于源码归档，不含`.git`，不承诺解压后直接`npm test`。干净解压后可运行`python3 production/verify_source_archive.py`检查所有清单文件和未列明文件，无需Git/npm/fontTools；这只验证归档完整性。模块数据流和扩展限制见[架构说明](docs/architecture.md)。

`qa:cast` 先在临时目录重建并比较9 SVG/2 JSON，再做净空检查；`npm test` 不写回这些跟踪文件。需要更新产物时显式 `build:cast`（`render:cast` 为兼容别名）。

单独渲染可用 `render:proposals` / `qa:design` / `qa:layout` / `render:cast` / `qa:cast`。输出位于 `design/frames/`、`design/boards/`、`typography/qa/`、原创归档提案本地产物目录及 `artifacts/smoke/`。

## 配置与教学合同

`design/scenes.json` 是参与者显示名、策略名、四格收益和默认选择的共同来源。图示标签、高亮、说明/字幕及口播生成器使用这些值。改变案例后运行 `build:narration` 并审查派生文本，不能只改单张图。QA按当前合法配置检查，不把原例的RB选择或固定收益当成不可修改合同；录音说明按姓名/数对的一般读法编写。

A 为行、B 为列，每格顺序始终为 (A,B)。当前原例 RR(3,3)、RB(0,5)、BR(5,0)、BB(1,1)。策略红/蓝身份不代表参与者。当前章解释参与者、信息、策略、收益，不把选中格称为最优/均衡；“看不到本轮选择”不等于“不完全信息”。

目前只支持两参与者、两策略、0–99 整数收益和有限长度文案。显示名最多 4 字符、策略名最多 2 字符；实际溢出/碰撞会失败，不缩小字号掩盖问题。字幕 38–48px、正文 36–42px、sans/serif 标题和颜色是支持的视觉配置；固定几何的更改需要更新 Schema 和布局合同。整集共用字幕、标题字体和B色板；其正文33px/次要页眉27px等固定合同见生产模块，不受静帧正文 token 控制。

timeline Schema 2.1 的 `reveal_scores` 是完整四格揭示合同：必须有各一个A/B事件，数组顺序任意，位置由player决定，汇总数对等到最晚offset；零/单项/重复玩家会在渲染前被拒绝。

`pause_after` 已包含在 start/end 字幕窗中：`end = voiceover_end + pause_after`。实际录音后按自然呼吸和语义重新对齐，不能重复追加尾停或把人工参考当同步验收。

## 工程与审查

[工程目录/Schema/版本流程](docs/project-structure.md) · [贡献指南](CONTRIBUTING.md) · [AGENTS 审查规则](AGENTS.md) · [交付检查单](docs/delivery-checklist.md) · [视觉系统](docs/visual-system.md) · [口播契约](chapters/01-four-elements/narration/README.md)

[Quality 工作流](.github/workflows/quality.yml) 在 PR/普通分支 push 上执行 Ubuntu/macOS 检查：只读 contents、官方 Actions 固定 SHA、不保留 checkout 凭证、不引用 secrets、不发布内容，也不使用 pull_request_target。实际 CI 结果必须对应最终 commit。GitHub/Codex Auto review 的账号连接与设置由独立任务管理。

保留已工作的 `design/`、`typography/` 相对导入。production 统一使用根案例、字体和第一章时间轴，保留生产渲染函数。后续生产资产/完整影片验收时，单独核对角色来源、音轨、中间帧、编码和播放端，不能把本基础工程通过扩写成正片完成。

## 许可证

保留原 [MIT LICENSE](LICENSE)，适用于本仓库原创源码/原创 SVG。Noto 字体受 [SIL OFL 1.1](docs/licenses/OFL-Noto.txt) 约束；MIT 不替代字体或 EA 内容权利。外部参考只列来源和设计观察，不分发截图/素材；见 [第三方内容边界](docs/third-party-content.md) 与 [视觉参考](docs/visual-references.md)。
