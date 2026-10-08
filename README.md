# Game Theory Studio

可复用的中文博弈论视频制作基础工程：把内容、口播时间轴、视觉语义和可编辑图形分开维护。

## 当前阶段

- **已选视觉方向：B「清爽教材」**。深蓝字线、暖白底、固定收益矩阵。A/C保留为同内容对照与回归样例。
- **系列角色方向已选《植物大战僵尸》的僵尸**，具体外形/角色组合仍在制作。本仓库只保留通用A/B角色接口，不分发EA角色位图或重绘图；见 [第三方内容边界](docs/third-party-content.md)。
- **第一章时间轴：173.3秒、37个字幕语义块**。这是人工口播参考，没有真人或合成人声音轨，尚未按实际音频对齐。
- **完整V2视频尚未在本仓库导出**。已实现可重建的参与者、收益矩阵两类静帧模板；不把模板QA当成全片、转场或音画同步验收。

机器可读状态见 [project-status.json](project-status.json)。

## 开始使用

要求：Node.js 22+、npm、Python 3.10+。已测试环境见 [验证记录](docs/validation.md)。

```sh
npm ci --ignore-scripts
python3 -m venv .venv
. .venv/bin/activate
python3 -m pip install -r requirements.txt
npm run setup:fonts
npm test
```

字体默认从本机已安装的Noto CJK中提取完整、明确的SC face，不改名冒充SC，也不依赖系统字体回退。若本机没有字体，可指定本地目录，或显式允许从官方版本下载：

```sh
npm run setup:fonts -- --source-dir /path/to/noto-fonts
npm run setup:fonts -- --download
```

详细来源、版本和许可证见 [字体说明](typography/README.md)。字体二进制、依赖、PNG、视频和生成QA报告均不提交Git。运行后，预览位于 `design/frames/`、`design/boards/` 与 `assets/characters/archive/proposals/png/`。

## 命令

- `npm run render:proposals`：渲染3套风格×2个1080p场景及3张对照板
- `npm run qa:design`：53项尺寸、像素一致性、确定性、边界、对比度与四格收益检查
- `npm run qa:fonts`：明确SC家族、400/700字重、完整字库和章节/模板字形覆盖
- `npm run build:narration`：重建第一章时间轴、SRT、录音参考稿
- `npm run qa:data`：JSON Schema、语义、收益、时间连续性与口播产物可复现检查
- `npm run render:cast`：重建已归档的9个原创SVG、4张历史提案PNG与清单
- `npm run qa:cast`：验证SVG可加载、无可见文字节点、角色与标签净空
- `npm run qa:source`：只检查仓库候选源文件，拦截常见凭证、私有路径、二进制和过大文件
- `npm test`：运行上述基础验收链；字体需先准备

## 目录

```text
chapters/01-four-elements/narration/  173.3秒内容、SRT、时间轴与生成器
assets/characters/                  通用角色接口；历史原创提案单独归档
design/                            已工作的tokens、场景数据与静帧渲染器
typography/                        显式SC字体注册与回归检查
schemas/                           场景与时间轴JSON Schema
scripts/                           字体准备、数据QA与公开源码检查
docs/                              视觉规范、公开研究来源、验收与许可证
```

保留已经工作的 `design/` 与 `typography/` 相对导入，暂不为目录命名重写渲染器。

## 教学语义约束

一轮积分游戏：A为行、B为列，每格顺序永远是(A, B)。红红(3,3)、红蓝(0,5)、蓝红(5,0)、蓝蓝(1,1)。策略的红/蓝颜色不代表角色身份。当前章只解释参与者、信息、策略、收益，不把选中格称为最优或均衡；“看不到对方本轮选择”不等于“不完全信息”。

`pause_after`已经包含在字幕的start/end窗口中，不要重复追加。真实录音完成后，以自然呼吸和语义重新对齐画面、字幕与章节边界。

## 文档与下一步

- [视觉系统与两个模板](docs/visual-system.md)
- [视觉研究及借鉴边界](docs/visual-references.md)
- [口播和时间轴契约](chapters/01-four-elements/narration/README.md)
- [基础验收记录与未覆盖项](docs/validation.md)

后续工作：确定具体角色形态与命名，完成生产级动作/表情，接入全时段画面，录音后重对齐，再验收完整导出。当前不包含进行中的生产代码、第三方截图或未完成的全片文件。

## 许可证

保留仓库原有 [MIT LICENSE](LICENSE)，适用于本仓库原创源码与原创SVG。Noto字体另受SIL Open Font License 1.1约束，见 [字体许可证说明](typography/README.md)。外部参考作品版权归原作者；本仓库只列公开来源和设计观察，不分发其截图、角色或音视频。
