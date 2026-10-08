# 贡献指南

先阅读 [AGENTS.md](AGENTS.md)、[工程与配置契约](docs/project-structure.md) 和 [第三方内容边界](docs/third-party-content.md)。保留原 MIT LICENSE，使用功能分支提交草稿PR。当前main仅LICENSE，按根README检出infra/quality-pipeline或对应评审分支后再运行工程命令。

## 从干净依赖开始

```sh
npm ci --ignore-scripts
npm run setup:python
npm run setup:fonts -- --download
npm test
```

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

PR 描述包含触发问题、结果行为、实际验证、已知限制与相关审查链接。CI 必须属于当前 head commit。基础建设阶段的叠加 PR 以 `setup/studio-foundation` 为 base；不要自行合并或直接写 main。GitHub/Codex Auto review 的连接和配置由独立任务管理。

创作内容复核见[教学内容检查单](docs/teaching-content-checklist.md)；通用元素、角色层坐标与支持范围见[可复用绘制接口](docs/render-elements.md)。
