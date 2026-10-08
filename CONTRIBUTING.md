# 贡献指南

先阅读 [AGENTS.md](AGENTS.md)、[工程与配置契约](docs/project-structure.md) 和 [第三方内容边界](docs/third-party-content.md)。保留原 MIT LICENSE，使用功能分支提交草稿 PR。

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

共享的显示名、策略名、收益和默认选择维护在 `design/scenes.json`。章节口播生成器从该案例读取这些值。修改后执行 `build:narration` 重建全部章节，检查中文数字、语义断行、参考语速和所有派生产物的 diff；真实录音完成后再对齐时间。手改派生 SRT 会被只读 QA 报为过期，不会被 QA 覆盖。

内容修改时递增该章节的 `contentVersion`。结构契约改变时先更新 Schema/版本与迁移说明，再改消费者；不要为了绕过验证删除 Schema 或负向样本。详见 [版本与更新流程](docs/project-structure.md#版本与更新流程)。

## 代码与依赖

- Node 使用 ESM 和内置测试器；Python 保留明确 UTF-8 I/O 和项目虚拟环境。优先复用现有 Canvas 渲染器与字体注册模块。
- 必要新依赖来自官方/常见包仓库，固定精确版本并更新 lockfile；说明用途、许可证和替代方案。不要使用 `npm audit fix --force` 自动改变范围。
- `@napi-rs/canvas` 1.0.10 用于本机 Skia/Canvas，Ajv 8.20.0 用于 draft-07 Schema，fontTools 4.61.1 用于完整 SC face 提取/字形检查。Ajv 从 8.17.1 升级以避开 [已公开的 `$data` ReDoS 问题](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6)；本项目没有启用 `$data`。
- 字体从官方固定 commit 下载并核验 SHA256；Actions 也固定 commit。升级时逐项复跑，不能只更新注释中的版本号。

## 提交与审查

运行 `npm test` 与 `git diff --check`，目视查看 B 两个模板、SC 字形板和改动涉及的中间帧。按 [交付检查单](docs/delivery-checklist.md) 记录范围与未覆盖项。生成的 PNG、视频、字体、本机 manifest 和机器 QA 报告不提交。

PR 描述包含触发问题、结果行为、实际验证、已知限制与相关审查链接。CI 必须属于当前 head commit。基础建设阶段的叠加 PR 以 `setup/studio-foundation` 为 base；不要自行合并或直接写 main。GitHub/Codex Auto review 的连接和配置由独立任务管理。
