# 贡献指南

先阅读 [AGENTS.md](AGENTS.md)、[工程与配置契约](docs/project-structure.md) 和 [第三方内容边界](docs/third-party-content.md)。保留原 MIT LICENSE，使用功能分支提交草稿PR。基础源码以 `main` 为长期开发入口。按根 README 获取 `main` 上已合入的源码；评审未合入的改动时请检出对应 PR 的 head。公开基础工程的检查不替代私有生产素材、完整影片和实际音轨验收。

## 从干净依赖开始

需要 Node 22+、npm 和 Python 3.12+，项目 `.venv` 也需使用 Python 3.12+。本轮将最低 Python 从 3.10 提升至 3.12，不再支持 3.10/3.11；CI 使用 Python 3.12 系列。

```sh
npm ci --ignore-scripts
npm run setup:python
npm run setup:fonts -- --download
npm test
```

跨 JavaScript/Python 的文本契约固定采用 Unicode 15.0 字符范围：先拒绝表外字符，再调用标准 NFKC 归一化。Python 需提供 Unicode 15.0 或更新的数据库；升级运行时不能自动扩大项目字符范围，修改该范围需要同步更新两端契约和回归测试。

`test:core` 现包含真实 Canvas 像素检查，必须在字体准备之后运行；不要把它当作无字体阶段。CI 顺序为显式下载固定官方字体 → 字体校验 → core/负例。`npm test` 先验证本地字体，缺失时明确失败，不自动下载。

macOS/Linux 都使用相同命令。npm 自动选择项目 `.venv`，无需激活或修改全局 Python。已有完整 SC 字体可用 `--source-dir` 离线准备；首次官方字体下载需要网络。详见 [故障排查](docs/troubleshooting.md)。

## 修改内容或新建章节

```sh
npm run chapter:new -- 02-example "新章节标题"
npm run build:narration -- 02-example
npm run qa:data
npm test
```

`chapter:new` 创建原型元数据、两段原创测试稿、生成器、UTF-8 时间轴/SRT/录音参考稿；拒绝路径穿越和覆盖已有章节。`00-original-example` 是随源码保留的非 IP 示例，不是正片章节。

共享的显示名、策略名、收益和默认选择维护在 `design/scenes.json`。章节口播生成器从该案例读取这些值。修改后执行 `build:narration` 重建全部章节，检查中文数字、语义断行、参考语速和所有派生产物的 diff；真实录音完成后再对齐时间。手改派生SRT、归档SVG/JSON会被只读QA报为过期，不会被QA覆盖。归档构建用显式 `build:cast`，测试只在临时目录重建比较。

`test:case-reuse`在隔离副本使用明月/青禾、合作/退出、不对称收益和默认BR，执行真实build与QA命令。设计QA核对当前配置的四格数字归属与默认高亮；负向测试根据当前fixture构造真实矛盾，不能假定原始值。

内容修改时递增该章节的 `contentVersion`。结构契约改变时先更新 Schema/版本与迁移说明，再改消费者；不要为了绕过验证删除 Schema 或负向样本。详见 [版本与更新流程](docs/project-structure.md#版本与更新流程)。

僵尸王国 [r2 编辑草稿](chapters/01-four-elements/editorial/zombie-kingdom-r2/README.md)与正式时间轴分开。修改共享案例/实验身份配置后，显式运行 `npm run build:editorial`，再以 `npm run qa:editorial` 只读比较语义 JSON、37段映射和提词器净稿；它不会批准正文、生成音频时间码或覆盖旧录制材料。

创作与制作验收使用[博弈论视频制作指南](docs/production-guide/video-production-guide.zh-CN.md)和[逐集十项验收模板](docs/production-guide/episode-acceptance-template.zh-CN.md)。[来源登记](docs/production-guide/sources.zh-CN.md)区分官方要求、研究建议与尚未核实的投稿规格；未做真人试听或实际平台播放的项目保持待验。

## 代码与依赖

- Node 使用 ESM 和内置测试器；Python 保留明确 UTF-8 I/O 和项目虚拟环境。优先复用现有 Canvas 渲染器与字体注册模块。
- 必要新依赖来自官方/常见包仓库，固定精确版本并更新 lockfile；说明用途、许可证和替代方案。不要使用 `npm audit fix --force` 自动改变范围。
- `@napi-rs/canvas` 1.0.10 用于本机 Skia/Canvas，Ajv 8.20.0 用于 draft-07/2020-12 Schema，fontTools 4.61.1 用于完整 SC face 提取/字形检查。Ajv 从 8.17.1 升级以避开 [已公开的 `$data` ReDoS 问题](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6)；本项目没有启用 `$data`。
- 可选 NumPy 2.3.5（BSD）用于固定种子的原创SFX，Pillow12.3.0（HPND）用于联系图；默认CI和静帧不用它们，使用 `setup:media` 安装同一虚拟环境。编码依赖外部FFmpeg/libx264，不自动下载安装。
- 整集修改保留根案例/时间轴/字体唯一来源，运行 `test:episode`，查看受影响转场；新章节内容脚手架不自动创建动画。
- timeline2.1完整格揭示需唯一A/B事件各一个，数组顺序可改变；零/单项输入不支持。修改配置名字和牌色时，也检查生产标签及实际牌像素，不能只验证模型值。
- 字体从官方固定 commit 下载并核验 SHA256；Actions 也固定 commit。升级时逐项复跑，不能只更新注释中的版本号。

## 提交与审查

运行 `npm test` 与 `git diff --check`，目视查看 B 两个模板、SC 字形板和改动涉及的中间帧。按 [交付检查单](docs/delivery-checklist.md) 记录范围与未覆盖项。生成的 PNG、视频、字体、本机 manifest 和机器 QA 报告不提交。

PR 描述包含触发问题、结果行为、实际验证、已知限制与相关审查链接。CI 必须属于当前 head commit。新功能和修复 PR 以 `main` 为 base；评审确需叠加分支时，在 PR 中明确临时 base 及依赖关系。不要自行合并或直接写 main。GitHub/Codex Auto review 的连接和配置由独立任务管理。

复发问题记入[质量回归记录](docs/quality-regressions.md)：写触发输入、可见影响、修复契约和能失败的负样本。桌牌支撑、腕点/手姿、真实接触与自然动作保持 OPEN，直到对应真实素材和中间帧完成验收；公共 fixture 或零 IK 误差不能关闭它们。

手、牌、桌的后续实现遵守[交互设计规范](docs/references/interaction-design.md)：先选稳定支撑方案，再登记腕点/腕轴/腕缝和握持框架，按七状态验证控制权、姿态与速度连续性。参考资料仅借鉴机制，不授权复制第三方运行时或素材。

可审阅的[项目技能指导草稿](draft_skills/README.md)分别覆盖交互、角色方向与视觉验收。它们未安装或自动启用，不授予额外权限，也不替代当前工程合同与实际证据。

创作内容复核见[教学内容检查单](docs/teaching-content-checklist.md)；通用元素、角色层坐标与支持范围见[可复用绘制接口](docs/render-elements.md)。
