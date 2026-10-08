# 第一集完整时间线渲染模块

`production/` 提供 174.1 秒、六节、30fps 的 B 暖白/深蓝教材风渲染器（章节内容2.0.2，完整时间轴5223帧）：参与者、信息遮挡与亮牌、一轮/多轮策略对照、四格逐项读表和复盘。当前main仅LICENSE；先按根README检出infra/quality-pipeline或对应评审分支。代码可执行整段时间线；当前时间窗是人工口播参考，没有配音对齐。云端已报告f694678的173.3秒私有PvZ视觉预览生成/验收、5199帧完整解码和与已验收媒体逐字节一致，影片与八层素材不在公开仓库。本轮修改后由生产验证重新绑定head；没有未知新hash或新head成片通过声明。公开占位CI与这项私有视觉证据分开。

## 创作说明

制作流程、横屏观看尺寸、录音后对齐、音频状态与发布范围见[博弈论视频制作指南](../docs/production-guide/video-production-guide.zh-CN.md)。逐集复制[十项验收模板](../docs/production-guide/episode-acceptance-template.zh-CN.md)，按实际完成的阶段记录通过、待验或不适用；外部建议的适用范围与访问限制见[来源登记](../docs/production-guide/sources.zh-CN.md)。历史媒体实测不自动覆盖修改后的源码，平台播放与真人试听需单独记录。

## 统一入口

所有命令从**仓库根目录**执行。这里只有一套 npm lockfile、Python `.venv`、SC 字体注册与字体准备；不要在 production 另装一套依赖。

```sh
npm ci --ignore-scripts
npm run setup:python
npm run setup:fonts -- --download
npm run test:episode
```

`test:episode` 包含语义/Schema、633个布局采样和转场中间帧、26个乱序得分事件等价帧、共享卡色像素和非占位模式显示名、SC 字符覆盖、变更案例回归、5 个原创 SVG、文本导出和 5 张原生1080p帧。公开 checkout 一律使用显式 `--placeholder-cast`，使用原创中性人物；普通生产模式缺少八个私有 RGBA 层时以 `PRIVATE_ASSET_MISSING` 失败，不静默换角色。CI 只使用原创占位角色。

## 制作与验收命令

```sh
# 默认关键帧和转场帧；随后可制作联系图
npm run render:episode:stills -- --placeholder-cast
npm run render:episode:stills -- --placeholder-cast --width 3840 --times 27,126.3,172
# 编码需要 PATH 上的 FFmpeg/libx264，静帧不需要
npm run render:episode:preview -- --placeholder-cast
npm run render:episode -- --placeholder-cast
npm run render:episode:4k -- --placeholder-cast
# 全片或显式 13s 预览的完整解码
npm run qa:episode:media -- production/output/game_theory_textbook_v2_clean_1920.mp4
npm run qa:episode:media -- --duration 13 production/output/transition_preview_1920.mp4
# 全帧布局检查（显式时间、原生1080p）
npm run qa:episode:layout -- --all-frames
npm run export:episode:text
# 可选原创音效/联系图，只安装到同一个 .venv
npm run setup:media
npm run make:episode:sfx
npm run make:episode:boards
# 仅公开源码归档，先运行同一源码边界扫描，无私有模式
npm run pack:source
```

视频无音轨；SFX 是固定随机种子合成的原创轻音效，不包含语音或音乐，也不会自动混进视频。录音后须重新对齐字幕、图形和数字揭示。参数仅支持原生1920/3840宽；无效、重复、非有限参数和越界时窗明确报错。

## 配置来源

- `../design/scenes.json` 是名字、策略名、四格得分和默认选择的唯一来源。修改后先运行 `build:narration`，再审查派生文本。
- `../chapters/01-four-elements/narration/timeline.json` 是唯一第一集时间轴；没有独立 production timeline 副本。
- `../design/tokens.json` 提供 B 色板、字幕38–48px和标题sans/serif。静帧正文配置只作用于静帧；整集布局合同固定正文33px、次要页眉最小27px、标题72px/复盘65px、得分64px。修改固定布局须更新 Schema、代码和验证，不能把常量当成可随意改的排版引擎。
- `cast.json` 1.1 只绑定 A/B身份、资源和外部角色类型；显示名/策略名不再重复存储。`content.json` 2.1 描述固定六节教学合同与共享来源；`tokens.json` 1.0 声明固定布局/编码合同。三者由 draft2020-12、Ajv strict 验证，未知字段和不支持的布局变更报错。
- timeline Schema2.1要求每个 `reveal_scores` 有A/B各一个事件，位置按player映射，汇总数对在所有事件的最晚offset后出现。零/单项/重复owner属于不支持输入，先在模型验证拒绝。
- `src/model.mjs` 验证这些来源并生成运行模型；`src/scenes.mjs` 使用显式时间绘制；`src/choreography.mjs` 共享选牌/手位相位。
- `src/rgba_character_rig.mjs` / `character_adapter.mjs` 只有分层位图坐标、旋转与蒙版代码；`assets/` 的五个原创 SVG 含真实路径。PNG 套 SVG 仍是位图。

## 本地产物与边界

`output/`、`qa/*.json`、`narration/exports/` 和资产校验联系图均忽略，不随 Git 发布。字体及 manifest 统一放根目录 `typography/fonts/`。打包收集整个统一仓库的公开源码候选文件，拒绝私有目录/二进制/检测到的秘密，附 SHA256 manifest 并校验 ZIP CRC；无参数私有归档已停用。

占位布局检查覆盖实际文字边界、文字碰撞和连接线；占位模式没有私有角色 alpha mask，不能据此声称生产角色净空通过。私有模式可用 `--actor-alpha` 检查实际角色层。长名字、策略名、字幕字号变更仍需中间帧和缩小预览目视验证。

实际本机记录见 [验证记录](../docs/validation.md)。不保留来源包中的历史私有媒体通过声明。4K 原生绘制可提高文字/矩阵分辨率，不能补出位图角色原图缺失的细节。

原 MIT [LICENSE](../LICENSE) 覆盖原创代码/SVG；字体使用独立 OFL。EA/PvZ 图像、重绘、截图、视频和私有角色素材均不在公开仓库，见 [素材边界](PRIVATE_ASSETS.md) 和 [第三方说明](../docs/third-party-content.md)。

创作内容复核见[教学内容检查单](../docs/teaching-content-checklist.md)；通用元素、角色层坐标与支持范围见[可复用绘制接口](../docs/render-elements.md)。
