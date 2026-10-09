# 质量回归记录

这是可复现的工程缺陷记录，不是整片通过证明。已修代码基线为 `88812adc`；`0b93331` 同步朝向文档。公共检查使用原创人物与几何素材，不能代替外部角色、真实手势、整片视听或平台播放验收。新增问题记录触发输入、可见错误、修复契约、正负样本和实际验证提交，不保存原始反馈、截图、私有素材或机器报告。

## 已修代码契约

| 问题 | 触发与可见影响 | 修复与复现 | 保留的边界 |
| --- | --- | --- | --- |
| SC 字形及字重不可靠 | 多地区 TTC 或系统字体别名不保证 SC；强制 regular 会使声明的 bold 与像素不同 | `067e293`：完整独立 SC OTF、真实 400/700，官方固定 SHA；本地 TTC 记录源 SHA 与 face index 并可重提。`npm run qa:fonts`；错误地区/家族/字重/字号及篡改 manifest 必须失败；verify-only 不改 provenance。入口：`scripts/setup_fonts.py`、`typography/font-contract.mjs`、`scripts/qa_font_provenance.py` | 存在字形不等于地区正确或缩小后可读，仍看原尺寸与缩小字形板 |
| 玩家归属、选择覆盖与数对顺序 | 事件数组换序或传入替换案例时，选择、高亮、数对可能错属 | `d04d446`、`067e293`：A 为行/收益 index 0，B 为列/index 1；显式选择覆盖优先，共享名字/策略/数字。`npm run qa:data`；`node --test tests/data.test.mjs tests/cast-readonly.test.mjs`；全部四格、四种选择、不对称收益及实际事件/高亮像素。默认 QA 临时重建比较，不覆盖派生文件 | 模型值相同不证明渲染的高亮、牌色和解释一致 |
| 合法案例替换被旧值测试误拒 | 测试固定旧名字、收益或默认选择，合法新案例也失败 | `92fdc37`：由当前 fixture 推导断言与录音指导。`npm run test:case-reuse`：隔离副本真实构建明月/青禾、合作/退出、不对称收益、默认 BR；负样本必须矛盾于当前配置。入口：`scripts/case-reuse-smoke.mjs` | 修改四字显示名不能沿旧参考时长自动宣布口播完成 |
| 原创 SVG 袖口穿帮 | 前臂在身体后、手在前；身体侧线/闭合下摆穿过手 | `e1a5966`：上臂→身体→前臂/细节→袖口→手；下摆开放。头、徽章、viewBox、桌位置保留。`node --test tests/public-art.test.mjs`；`npm run render:art-proof -- --before-sha 986933b`；旧层序/闭合线/素材篡改负样本须失败 | 公共 SVG 路径与私有分层位图路径不同；前者通过不证明后者无接缝，不能靠遮罩、缩小或改 hash 隐藏缺陷 |
| 手牌遮挡圆形/横杠 | 手接触点与识别符号接近；文字/符号可能看不清 | `e1a5966`：符号中心移至 `(70,73)`，蓝杠 y64，标签仍 `(70,130)`。`2328fba`：idle 手位置与真实标签绘制契约；附件/卡牌测试覆盖全部四选择与运动角度，Canvas 负向测试真实字号/基线 | 腕点距离、手 alpha 净空、自然握持是三种不同证据；不能把符号重画在手上方当成通过 |
| 名字贴着角色 | 标签到实际不透明角色像素 9–31px 仍可能被宽松检查放过 | `2328fba`：32px 名字净空、24px 正文目标；`node --test tests/actor-clearance.test.mjs`；`production/qa/actor-clearance.mjs` 消费真实 alpha 与测量文本框，保留旧 8px 检查会放过的负样本 | 文本框检查不能涵盖线、边框、所有图文关系；新真实素材须重做 alpha 验证 |
| 身体与头朝向相反 | 不同源层原始方向不同，全部 B 层统一预翻会令 B torso 双翻 | `88812adc`：torso 预翻仅 A，非 torso 预翻仅 B；prepared 全向右，场景 A +1/B −1。`node --test tests/character-layers.test.mjs`：真实 loader、原创非对称像素、场景镜像及旧双翻负样本；骨架、pivot、头锚不移动 | `storedFacing/preparedFacing/sceneSide/worldFacing` 声明须由像素验证；`0b93331` 修正文档旧预翻摘要 |

## PR #3 桌牌/编辑稿回归

基于 `c903741` 复现并修复；测试命令与负样本随源码保留，本节不替代最终提交的执行报告。

- 桌牌矩阵原来只输出当前选择，模型测试不能证明四种选择的实际填色/边框。`qa-matrix.mjs` 复用真正的身份矩阵绘制入口，以当前案例与四字姓名/不对称收益各渲染四格选择，采样填色、独立边框以及按配置归属的实际数对字形。`tests/tabletop-matrix.test.mjs` 保留固定RB、转置选择/数对、错配收益所有权、丢失边框及把收益字画成纸色的负例；最终画布字形像素也必须匹配，不能只重放文字alpha。
- 默认公共B列头像到姓名实际alpha/墨迹仅25px，A行也不足32px。仅移动头像、不缩字号；逐一检查B列及两行A头像到姓名≥32px，旧行/列布局分别必须失败。身份对照板桌子的右沿同步缩短，避免移位后的下排头像贴住斜线；不改三种桌牌原型。公共原创头像通过不证明私有头层净空。
- 四字姓名“明月清风/青禾山川”真实重建后拾牌锚点移动，旧36.7s不再是部分淡出帧。原型测试、对照板与平牌回归片均由`interactionSchedule(timeline)`取样；保留两字/四字的真实重建、部分淡出状态和旧时间负对照。
- 编辑稿b29把`pair.BR`改为`pair.RB`后重建，旧QA只查产物新鲜度，会让口播A=5/B=0、画面(0,5)同时通过。构建/检查现在先验证四条路径的策略、玩家、数对token及原段落绑定；四格使用独立不等收益验证口播、视觉与所有权，保留25个矛盾变异及重建后仍新鲜的错误BR负例。非对称RR/BB的强调提示同时列出两位玩家收益。
- presentation原仅限长，换行、控制字符、纯空白可导致Canvas显示与口播不一致。所有自由单行字段拒绝控制/格式控制和空白字符串，保留正常中文姓名、标点及长度合同的正反例。

## 干净 CI 的字体准备顺序

PR #3 新增实际 Canvas 回归后，`test:core` 已需要SC字体；旧工作流却先运行core、后准备字体。在预置字体的本地环境通过，不能证明干净Ubuntu/macOS CI可启动。工作流现在保持固定官方下载与checksum校验，并将字体准备、字体QA前置到core；`npm test` 同样先只读验证字体。

`tests/ci-font-order.test.mjs` 检查真实工作流及npm聚合阶段顺序，旧顺序和移除准备步骤必须失败。独立源码副本先解除自己的字体缓存符号链接、创建真正空目录，确认真实矩阵QA报缺失SC字体；随后复制并独立验证既有缓存的完整来源/校验契约，再运行全部八张矩阵光栅。此回归不借用系统字体、不省略光栅测试，也不把缓存恢复声称为重新联网下载。

## PR #4 公开基础工程：两轮 18 项回归

记录日期：2026-10-09（UTC）。以下对应[首轮 9 项审查](https://github.com/trainMyBrain233/game-theory-studio/pull/4#pullrequestreview-5465439790)与[第二轮 9 项审查](https://github.com/trainMyBrain233/game-theory-studio/pull/4#pullrequestreview-5465703641)；“一/二”标识审查轮次，不改变上文历史验证范围。首轮修补已发布至 `7da7fa1`；第二轮及后续测试修正仍待最终提交的完整 CI 和复审。本节记录实现契约与可复现检查，不表示外部问题已关闭或整片已验收。

### 标签、字幕与编辑稿

- **一-1：可见标签与 NFKC 唯一性。** 玩家名仅差尾空格、全空白策略或 `Ａ/A` 等归一化重名，会让校验通过却显示空白或难以区分的身份。`scripts/text-contract.mjs`、`scripts/text_contract.py` 统一要求已去首尾空白、可见、单行且无控制/默认忽略字符；在支持字符范围内按 NFKC 与空格归一化比较唯一性，不悄悄改写显示名。`tests/text-contract.test.mjs`、`tests/test_text_contract.py` 同时检查 JS 正片入口与 Python 生成器的空白、不可见字符、组合重音及兼容字符碰撞，并保留不同中文名、扩展汉字的正例。合法文本仍须另验字体覆盖与布局。
- **一-2：正片字幕不能在语义内部断行。** 把 RR 选择句拆成姓名加“选”与剩余策略，即使拼回原口播、每行不超限，也会拆散条件。共享文本契约要求字幕逐字保留口播，只在完整分句标点后断行，保护当前姓名、策略、选择与收益归属句；生成器无法排入两行时明确失败。`tests/text-contract.test.mjs`、`tests/test_text_contract.py` 保留姓名、选择、数字、归属和集体收益的拆分负例，以及完整条件/结果分行的正例；标签内自带逗号也不能成为断点。这是模板与 cue 的有界语义合同，不是任意自然语言解析。
- **一-3：22 字限制不能漏算非 ASCII。** 23 个 `é`、扩展汉字或非 ASCII 数字原可被计为零。两语言现在共享 `scripts/unicode-text-15.0.0.json`，按 Unicode 15.0 的 L*/N* 码点计数，并明确拒绝表外字符。`tests/text-contract.test.mjs`、`tests/test_text_contract.py` 检查各类字符的 22/23 边界、跨语言结果、口播时长/metrics 和固定表重建；组合符、标点与 emoji 的计数另有正例。码点数不代表字素数、阅读速度或实际字形可用。
- **二-7：编辑稿建议字幕也必须符合口播合同。** 只改 `suggested_lines` 为另一句话，旧编辑稿可重建成“新鲜”产物却与口播不符。`chapters/01-four-elements/editorial/zombie-kingdom-r2/build.mjs` 现在同时校验各 chunk 的 `spoken_span` 拼接、建议行精确文本、两行/22 字、分句边界及跨 chunk 的保护词。`tests/editorial-draft.test.mjs` 覆盖错文、缺 chunk、三行、隐藏字符、长行、带标点姓名/策略和选择/收益拆分；真实 build 与 `--check` 都须在写产物前拒绝，默认产物字节不变。
- **二-8：编辑 token 只能查自身字典。** `{{constructor}}`、`{{toString}}` 等继承自 Object 的属性原可能被当作合法 token，污染录音注释或强调内容。编辑构建器改用 `Object.hasOwn`，完整 token、嵌入文本和数组展开都走同一检查。`tests/editorial-draft.test.mjs` 的 `editorial template tokens reject unknown and inherited Object properties in every expansion path` 检查未知键及继承键，并验证 build/check 失败时保留原产物。

### 亮牌状态、渲染入口与净空

- **一-8：口播承诺必须有完整亮牌周期。** 删除 reveal/conceal 任一端、同时删两端或重复收牌，不能因为“剩余事件有序”就通过。`production/src/animatic/semantic-state.mjs` 从每个 participants 叙述独立建立亮牌期待，再检查 hidden→reveal→conceal 的非重叠周期。`tests/animatic-reveal-cycles.test.mjs` 覆盖空事件、缺端、重复、倒序、同帧、移错 phase、多个 participants、两种时制，以及边界/25%/50%/75% 和乱序取帧；不承诺亮牌的叙述仍可没有卡牌事件。
- **二-1：跨 phase 持牌须与当前叙述相容。** RB 牌留到 RR 叙述，即使边框尚未激活，画面已经与口播矛盾。编译器检查整个 `[reveal.frame, conceal.frame)` 与所有相交 phase 的 `expectedCell`；新 participants 开始前要收起上一轮。`tests/animatic-reveal-cycles.test.mjs` 保留原 RB→RR 反例、相容持牌、无 focus 总结、总结后再次矛盾、下一 phase 起点收牌与迟一帧收牌的正反例。不能用禁止所有跨 phase 持牌来绕过问题，兼容 case/comparison 和无 focus 总结仍可保留同一周期。
- **一-6：正时长不等于至少一帧。** 30fps 下 `--duration 0.01` 或片尾仅余 0.01 秒会量化为零帧，原来启动编码器后才失败。`production/src/render-options.mjs` 与 `production/render.mjs` 共用 `videoFrameCount`，要求 `Math.round(fps * duration)` 为至少 1 的安全整数。`tests/render-window-checkpoints.test.mjs` 检查显式/片尾零帧、不同 fps、溢出及真实 CLI 的拒绝顺序；0.02 秒在 30fps 量化为一帧仍合法。入口 stub 证明早拒绝，不证明实际编码完成。
- **一-7：拒绝横纵异比拉伸。** 1280×1080 画布曾把固定 1920×1080 布局横向压缩，失真坐标中的边界检查却可通过。`design/canvas-geometry.mjs`、`design/render-proposals.mjs` 仅接受正整数、精确 16:9 画布，并使用单一比例。`tests/render-window-checkpoints.test.mjs` 验证在取得 context 前拒绝；`tests/proposal-aspect-canvas.test.mjs` 先载隔离字体，再用实际 Canvas 检查原尺寸、缩小和 4K 的文字边界与圆形徽章像素比例。纯几何/stub 通过不能替代这项光栅检查。
- **二-5：低 alpha 也属于人物像素。** 默认忽略 alpha 1–40，会让淡入/淡出人物与文字靠得过近仍通过。`production/qa/actor-clearance.mjs` 默认计入所有非零 alpha；显式阈值须为 0–255 整数字节，只忽略小于等于阈值的像素。`tests/actor-clearance-alpha.test.mjs` 逐一检查 1–255、alpha 0、32px 姓名/24px 正文边界及非法阈值的早拒绝。合成 RGBA mask 验证算法，不是私有角色或实际转场净空验收。
- **二-9：帧时间必须是有限数字。** `NaN` 或无穷值原可进入状态更新、被静默夹到端点或引发误导性下游错误。`production/src/scenes.mjs` 的 `drawFrame` 先做 `Number.isFinite`，在记录、人物状态或 context 接触前拒绝；有限越界时间仍按已有合同夹到片头/片尾。`tests/renderer-boundary-regressions.test.mjs` 经真实入口配 stub 检查 `NaN`、正负无穷、字符串及可强制转换值，同时保留正常时间和有限越界的正例。

### 当前时间轴与静帧身份

- **一-9：默认静帧不能继续采旧绝对秒。** 合法长姓名/策略/不对称收益重建后，段落起点会变；旧秒数配旧标签能生成成功但采错内容。`production/src/checkpoints.mjs` 从当前 section/segment 生成检查点，`production/render.mjs` 与 `production/make_contact_sheets.py` 共用 manifest 的时间、标签、文件名及时间轴/图片身份；显式 `--times` 保留用户值。`tests/render-window-checkpoints.test.mjs` 用真实长姓名重建、旧图拒绝、缺失/重复锚点、元数据篡改、越界路径/symlink 和损坏 PNG（含非空 IEND）检查生产链。检查点集合本身不覆盖每个改动转场的全部中间/相邻帧。
- **二-4：零尾停顿仍需合法的段内样本。** `pause_after=0` 时，旧“暂停中点”等于半开区间的 end，合法时间轴反而无法生成默认静帧。检查点现在取 end 前一个可表示的 Float64，标为 `segment_end_interior`；正暂停保留原中点，异常口播窗口仍拒绝。`tests/renderer-boundary-regressions.test.mjs` 检查零暂停、纳秒/单 ULP 极短段、正暂停舍入、序列化后身份验证和下一段边界。此取样不声称存在口播后阅读暂停，也不声称恰在 end 的收益事件已完成。

### 公开源码与归档边界

- **一-4：无 script 元素不等于无脚本。** SVG 根或嵌套形状的 `onload`/`onclick` 原可漏检。`scripts/qa_source.py` 解析 XML 后对属性 local-name 忽略大小写/命名空间，拒绝所有 `on*`。`tests/test_source_svg_safety.py` 检查根/嵌套、混合大小写、命名空间和未来事件名；原创形状、局部引用与普通说明文字保留。CLI 不回显属性值，公开打包失败不覆盖已有 archive；测试只解析，不执行事件。
- **二-2：SVG 的局部引用不可被 CSS、base URI 或动画改义。** 转义后的 import/url、CSS 注释、`xml:base` 或动画改写资源属性可绕过字面检查，公开文件可能加载外部内容。源码 guard 采用明确的静态子集：拒绝 CSS 转义/注释/at-rule、不支持的函数、base URI 与动画元素；保留完整字面的局部 fragment 及有限数值颜色/变换。`tests/test_public_source_boundaries.py` 的 `SvgCssBoundaryTests` 检查 XML 解码后的转义、style/属性三种入口、局部引用正例及无回显错误。边界见 `docs/public-source-boundaries.md`，这不是通用 SVG sanitizer。
- **二-3：归档校验不可依赖可被优化移除的 assert。** 用 Python `-O`/`-OO` 或 `PYTHONOPTIMIZE` 运行时，旧 assert 可消失，错误字节或不安全清单可能被判通过。`production/verify_source_archive.py` 改为显式失败，先验证 manifest 类型/来源字段、规范相对路径、非 symlink 常规文件、长度/摘要与完整目录清单，再加载校验器自身的源码 guard。`tests/test_public_source_boundaries.py` 的 `ArchiveBoundaryTests` 在全部优化模式检查有效归档只读通过，篡改/缺失/多余文件、非法路径、symlink、合法摘要下违规源码均拒绝，且不执行调用者提供的 guard、不回显不可信值。字节一致不是发布者签名或真实性证明。
- **二-6：机器路径检查要覆盖 Windows。** 只识别 Unix home/workspace 会遗漏盘符绝对路径、反斜线 UNC、设备/扩展路径及 JSON 转义写法，导致机器信息进入公开源码。`scripts/qa_source.py` 增加这些检测，保留 URL、相对路径与常见正则转义；通用 Windows 系统根仅有精确带引号例外，不能借前缀放行子路径。`tests/test_public_source_boundaries.py` 的 `WindowsPathBoundaryTests` 在运行时构造正反样本，不把真实机器路径放入测试。跨格式检测不代表已在 Windows 上运行完整工程，也不保证发现所有秘密。

### 入门、运行时与复发测试自身

- **一-5：长期入口不能指向旧评审分支。** README 的旧分支 clone 与“main 只有 LICENSE”描述会把新使用者导向过期源码。`README.md`、`CONTRIBUTING.md` 和 `scripts/qa_source.py` 统一以 `main` 为长期入口，未合入改动明确检出对应 PR head。`tests/test_source_svg_safety.py` 的 `test_no_git_failure_points_to_main` 检查无 Git 时的可操作错误提示；文档 clone/base 指引另需源码复核。这不宣称 PR #4 已合并。

共享文本契约也带来明确的迁移与分发要求：最低 Python 为 3.12，normalizer 的 Unicode 数据至少为 15.0；Node 为 22+，项目支持字符集仍固定为 Unicode 15.0。`scripts/setup-python.mjs` 不仅检查 bootstrap，还在复用旧 `.venv` 前和创建后检查实际目标解释器，再运行 pip；旧 3.10/3.11、失效解释器或旧 UCD 需先移开旧环境保留数据，不能只换 bootstrap 就声称迁移成功。`tests/setup-python-migration.test.mjs` 保留早拒绝、旧目标及正常流程检查。Unicode 派生表与生成器范围必须随附 `docs/licenses/Unicode-15.0.0.txt`；`tests/text-contract.test.mjs` 检查完整且版本匹配的历史声明，详见 `scripts/unicode-text-contract.md`、`docs/third-party-content.md`。

**CI 也发现了回归测试自身的缺陷。** `7da7fa1` 的[Quality run](https://github.com/trainMyBrain233/game-theory-studio/actions/runs/37883013642)在 changed-case reuse 中因六个文本测试硬编码原姓名/收益或原对称情形而失败。修正后的 `tests/text-contract.test.mjs` 从当前 case/cue 推导拆分输入；需要可拆多字姓名、两位收益或等收益时，显式临时重建合适 fixture。每个负例先确认原时间轴合法、行长合法、口播未改变，再精确断言语义错误；完整分句正例仍须通过。新增 changed-case、单字名/单字数字/等收益变体，避免把无效测试构造或另一个校验失败当作防复发证据。这个教训补充上文 `92fdc37` 的案例复用合同，不能把旧默认案例单测通过当作 `test:case-reuse` 通过。

**本节实际验证范围：** 首轮文本/Unicode、Python SVG、亮牌状态、渲染窗口/检查点与 venv 迁移已有专项执行证据；第二轮候选代码的净空 alpha、零暂停/有限时间、亮牌周期、编辑稿、animatic 状态/源绑定、动态文本 fixture 及 Python 公开边界专项已通过，`qa:data`（默认重建字节相同）、`qa:editorial` 与 `qa:source` 也已通过。上述是分组检查，既不相加成完整测试总数，也不迁移为下一提交的通过结果。最终 head 的干净依赖、完整 `npm test`/`test:case-reuse`、双平台 CI 与复审仍待确认；本轮本地未做重型光栅/联系图执行。实际 Canvas 比例、字体、联系图完整解码、所有改动转场中间/相邻帧及视觉检查仍须绑定最终版本；私有素材、自然手势、完整编码解码、试听/声画对齐与平台播放继续单独验收。

## PR #4 后续 5 项：候选修补，集成与复审待完成

记录日期：2026-10-09（UTC）。后续审查针对 `a153` 的 production 内容；当时已发布 head `b2dbc6f58f052e01daf5fc5a28dd379344d2c1f9` 保留相同 production 内容，虽有绿色 [Quality run](https://github.com/trainMyBrain233/game-theory-studio/actions/runs/37886242723)，仍被以下五项阻塞。本节补充而不替换前两轮 18 项；上节执行范围是当时记录，不能当作这些新候选修补的通过证明。以下记录该轮候选实现及测试的复发教训，字体候选冻结后已完成下述专项验证；后续 `dda765` 集成 CI 的新失败与修补见本节末，最终新 head 的完整干净 CI 及复审仍未完成，不能称为全部接受或问题已关闭。

- **后续-1：presentation 入口也要执行归一化后的姓名唯一性。** 只比较原始字符串，会让 `Ａ/A`、`é/é`、`Ⅻ/XII` 或只差空格形式的两个名字在桌牌与编辑稿适配后失去可区分身份；主案例已有校验不代表旁路入口受保护。`design/experiments/tabletop/presentation.mjs` 的候选实现对 A/B 名字调用共享 `normalizedLabel`，先要求可见、已去首尾空白、Unicode 15.0 支持范围内的单行标签，再按 NFKC 与空格折叠结果判重；显示文本仍保留作者原始码点，不改案例、玩家归属或输入对象。`tests/presentation-unicode.test.mjs` 保留兼容/组合字符与空格碰撞、默认忽略字符、仅符号/组合符、非法/表外字符负例，以及不同中文名、扩展汉字、重音与标点姓名正例。教训：共享合同必须覆盖每个配置适配入口，Schema 限长和原始字符串不等都不足以证明身份可区分；合法字符仍需另验字形与布局。
- **后续-2：编辑稿指标不能另写一套 BMP/ASCII 计数器。** 原稿与草稿的 `spoken_character_count` 仍用基本汉字加 ASCII 正则时，重音字母、扩展汉字与非 ASCII 数字会漏算，即使字幕校验已使用新合同。`chapters/01-four-elements/editorial/zombie-kingdom-r2/build.mjs` 的两个指标改用共享 `readableCount`，定义明确为固定 Unicode 15.0 的 L*/N* 码点数；补充平面字母/数字各算一次，空白、标点、组合符和符号不计入。`tests/editorial-unicode-metrics.test.mjs` 用独立八码点样本、真实叙述/编辑稿重建及旧正则低估负对照覆盖两项指标，并保留当前案例与无时间码状态。教训：派生指标也属于跨入口文本合同；字符数量不是字素数、自然语速、预测片长或真人音频对齐，不能据此重写正式时间轴。
- **后续-3：原生字体注册前必须验证真实字节、独立来源与别名所有权。** 直接渲染原来只检查文件存在及 family 的 400/700 声明，未必先执行 `qa:fonts`；同时伪改字体与 manifest 的 hash，或预注册同名错误字体，都可能绕过准备阶段的信任边界。当前字体候选由 `typography/font-provenance.mjs` 和 `typography/verify-fonts.py` 在注册边界只读复用 `setup_fonts.verify_cached()`：官方固定 SHA，或原 TTC 源 SHA/face index 的独立重提，以及 SC 家族、版本、真实字重和字库合同。证明缓存绑定实际字体、manifest、验证代码及原 TTC 源字节，不能仅依路径、大小或 mtime；Canvas 接收重新核对摘要的内存 buffer，不在逐帧绘制中读盘或启动验证。`typography/font-registration.mjs` 持有原生 FontKey，拒绝未经持有的同名 alias；重复调用只续注册自身 keys，并检查外部移除、替换、混入及失败回滚，合法字节更换也要求新渲染进程。`tests/font-registration.test.mjs`、`tests/font-provenance-cache.test.mjs`、`tests/test_font_registration_verifier.py` 提供无真实字体的所有权/缓存/只读适配回归；`tests/font-registration-provenance.test.mjs` 另保留静态与 production 直接入口、联合伪改、原 TTC 变更和真实原生别名负例，该真实字体/原生注册专项已在冻结候选上串行通过 4/4（16.3 秒，Linux、Node 24.19.0、Python 3.12.14），覆盖自有 keys 与无关 alias 保留、禁用 Python 后复用既有字节证明、直接 import 拒绝伪造字体及 manifest、原 TTC 源与 face index 负例；无真实字体的 Node 核心/模拟 11 项和 Python 适配 3 项也已通过。最终 head 仍须重新绑定完整验证，不能把专项结果移植为新提交通过。教训：声明与自报 hash 不能证明来源，已有 family/字重列表不能证明原生对象属于本模块；只读验证不得下载、修复或重写 provenance，工程合同也不代替 SC 字形与缩小阅读验收。
- **后续-4：Python 媒体 QA 必须与 JS 编码器在半帧处同舍入。** 30fps 下 0.15 秒和 0.35 秒，JS `Math.round` 产生 5/11 帧，Python `round` 的 ties-to-even 却期待 4/10 帧，合法输出因此可能被误拒。`production/qa/media_contract.py` 的候选 `video_frame_count` 与 JS `videoFrameCount` 统一有限正数、binary64 乘积、非负精确半值向上，以及至少一帧/安全整数上界；拆开整数和小数部分判定，避免 `floor(product + 0.5)` 把半值前一浮点数或最大安全整数再舍入错。媒体时长预期继续由 `frames / fps` 推导。`tests/fixtures/video-frame-count-contract.json`、`tests/media-frame-count.test.mjs`、`tests/test_media_contract.py` 共享明确期望，覆盖奇偶半值及相邻可表示值、亚帧、非整数 fps、安全整数边界、溢出/下溢及非法类型，并拒绝旧 4/10 帧元数据。合同见 `production/qa/frame-count-contract.md`。教训：跨语言默认舍入不是同一合同，不能只测整秒；纯计数/元数据样本不证明实际编码、完整解码或声画同步。
- **后续-5：SVG 要限定精确 namespace 与完整静态元素白名单。** 仅检查标签 local-name 的危险列表会漏掉外来 HTML `iframe` 的转义 `srcdoc` 内容，文件里没有直接的 SVG `script` 也不安全。`scripts/qa_source.py` 的候选 guard 对每个元素只接受精确、区分大小写的 `http://www.w3.org/2000/svg` namespace 或无 namespace，并要求属于 `STATIC_SVG_ELEMENTS` 的固定形状、定义、文字与局部引用子集；前缀不改变 namespace 身份，未知或未来元素即使在 SVG namespace 中也拒绝。完整子集与兼容的 local-name 大小写行为见 `docs/public-source-boundaries.md`。`tests/test_public_source_boundaries.py` 的 `SvgNamespaceBoundaryTests` 覆盖 HTML iframe/srcdoc、外来默认/前缀/nested namespace、近似 URI、SVG/无 namespace 的未知标签，保留原创静态元素、局部引用与合法 namespace 重置正例，并检查 CLI/优化模式归档失败不回显 payload；样本只解析，不打开、渲染或执行。教训：信任边界要用允许范围封闭定义，不能靠不断加危险标签补洞；这个公开源码静态子集仍不是通用 SVG sanitizer。

**本次记录的验证边界：** 此文档更新本身只核对源码、测试定义与文档差异；字体冻结候选的实际专项执行范围与运行时见后续-3，不将 Node 核心/模拟、Python 适配和原生套件相加成完整工程通过数。`b2dbc6f` 的绿色 CI 不包含这些后续未集成修补的接受结论。最终提交的完整 `npm test`、案例复用、干净双平台 CI 及复审仍待确认；已过字体专项也需与最终 head 对齐。这里记录公开工程验证，没有新增私有影片、自然手势、完整编码解码或真人音频验收结论；相关 OPEN 项保持原有边界。

### 后续集成 CI：fixture 依赖传播与纯源码隔离

`dda765` 的 [Quality run](https://github.com/trainMyBrain233/game-theory-studio/actions/runs/37888140871) 在 Ubuntu/macOS 均完成干净依赖、内容检查及官方字体准备；真实字体运行时的 229 字形、OTF 篡改负例与 4 项 TTC 来源检查已通过。随后 `test:font-mutations` 在预期的字重/字号/家族断言之前报 `Missing fontTools`，因此该 run 不是完整通过。这是普通隔离 fixture 子进程没有继承已选项目 Python 的依赖传播问题；可选 `--full-pipeline` 子进程原本已传入 `PYTHON`，不能据此假设普通路径也正确。

- **解释器是 fixture 的显式依赖。** `withSourceFixture` 只复制公开源码并共享只读字体/node_modules，不复制项目 `.venv`。新注册边界需要 Python/fontTools 后，子进程在临时根自动发现解释器会退回没有依赖的系统 `python3`。`scripts/font-mutation-smoke.mjs` 的普通子进程现显式传入 `PYTHON: pythonCommand()`；同样修正桌牌矩阵、两字/四字时序复用、episode model 与 motion QA 子进程。不能把前置缺依赖的失败当作成功捕获原始 mutation，也不应通过复制虚拟环境或去掉真实来源验证掩盖问题。
- **纯源码生成不得被顶层原生导入绑住。** `draw_cast.mjs --source-only` 原来仍 eager import Canvas/字体模块；字体模块增加相对依赖后，`qa-cast-source.mjs` 的最小源码副本只拷贝一个 `fonts.mjs`，会因导入闭包不完整失败。`assets/characters/archive/proposals/draw_cast.mjs` 现仅在非 source-only 路径动态导入并注册字体、加载 Canvas；纯 SVG/JSON 重建保持无字体、无原生依赖。`scripts/qa-cast-source.mjs` 与 `tests/cast-readonly.test.mjs` 移除不必要的字体拷贝、node_modules 链接及隔离字体 preload，并在缺少 typography/node_modules 的副本中验证重建及保留人工改动。教训是分离真正的运行时依赖，而不是继续零散补拷贝模块。

**本次候选修补的实际证据：** 在父进程未设置 `PYTHON`、且已确认 fallback Python 没有 fontTools 的条件下，三项真实字体 mutation（forced regular、8px、forced Sans）均到达并通过各自预期的拒绝断言；相关 fixture 定向测试 14 项通过。`qa:cast` 通过 11 个只读源码产物比较、9 个 SVG 与 6 项 alpha 净空，最小 59.8px，高于 32px 合同。这些是候选修补的专项证据，不替代新 head 的完整 CI，也不扩展为私有角色或整片验收。

**未得出结论的本地运行：** 完整字体 QA 中既有 `qa_font_provenance.py` 阶段收到 `SIGKILL`，原因未知；episode smoke 的 model 子进程返回 `status=null` 且无输出，未取得完成证据。两者均未重试，不将它们归因为 OOM、测试逻辑失败或已通过，也不把 `dda765` 干净 CI 中已过的来源检查移植为本地新候选完整通过。最终新 head 的完整工程检查、双平台干净 CI 与复审仍待完成，审查项保持未关闭。

## PR #4 `dda765` 新轮 5 项：公开入口修补，最终验收待完成

记录日期：2026-10-09（UTC）。对 `dda765ddb7051ee77cc6f308a9a913ba6a9483a9` 的新一轮审查已结束，留下四项代码 P2 和一项安全 P2。它们是前文合同尚未覆盖所有公开入口的新证据；前 18 项、后续五项及 fixture 依赖教训均保留。本节记录候选实现和专项证据，不表示修补已发布、完整 CI 已通过或外部审查项已关闭。

- **新轮-1：收益载荷必须绑定 `reveal_scores` action。** [审查复现](https://github.com/trainMyBrain233/game-theory-studio/pull/4#discussion_r4226935744)把 RR 段 action 改为 `note`，同时保留 `scores` 与两个 `score_reveals`；旧校验仍通过，production 后续按 reveal action 查找段落时才缺失并崩溃。`scripts/validate-data.mjs` 现要求只要存在任一收益字段，就必须使用 `reveal_scores`；原有 Schema 2.1 完整 A/B 事件、矩阵格、数值、归属与口播窗口检查保留。`tests/timeline-score-action.test.mjs` 覆盖四格、两种错误 action、单独/同时出现的收益字段，默认案例及真实重建的长中文名、改策略、不对称收益、默认 BR；合法无收益 note、事件换序和边界 offset 仍通过。教训：验证 payload 内容还不够，必须与消费者用来查找它的 action 一致，不能等到开始绘制后才发现语义缺口。
- **新轮-2：直接 `drawFrame` 也必须守住 16:9。** [审查复现](https://github.com/trainMyBrain233/game-theory-studio/pull/4#discussion_r4226935755)直接传入 1280×1080 画布，production 曾按横纵两个比例变换，压扁人物、圆形和文字；只修静态模板入口不保护这个 API。`production/src/scenes.mjs` 复用 `design/canvas-geometry.mjs` 的正整数、精确 16:9 检查，在 `resetRecords`、`setSceneTime` 与取得 context 前拒绝非法画布，合法画布只使用一个 scale。有限时间检查仍先于几何读取，有限越界时间仍按原合同夹到片头/片尾。`tests/renderer-aspect-boundary.test.mjs` 覆盖 1280×1080 等拉伸输入、非法尺寸、四种合法 16:9 尺寸及渲染状态早拒绝顺序。教训：所有可直接调用的渲染入口都要验证几何，CLI 参数安全不等于 API 安全；stub 的 uniform transform 证据不等于整片像素、净空或转场验收。
- **新轮-3：字形清单要来自当前 presentation 与编辑稿解析结果。** [审查复现](https://github.com/trainMyBrain233/game-theory-studio/pull/4#discussion_r4226935758)中 A=`ع`、B=`乙` 符合共享 Unicode 标签合同，却不在已准备 SC 字体的 cmap 内；旧清单只读主案例/时间轴，因此即使系统字体关闭也能漏掉桌牌缺字。`typography/text-inventory.mjs` 的候选清单读取当前 presentation，经 `presentationModel`/`identityTextPlan`、共享 `design/experiments/tabletop/display-text.mjs` 和 `currentProducts()` 在内存解析实际姓名、header、策略/收益标签、桌牌/交互 Canvas 文案与阶段标签，以及编辑稿口播/录音文字，不依赖可能过时的已生成编辑稿，不写回跟踪产物；`typography/qa-fonts.mjs` 把该清单加入真实 cmap QA。`tests/presentation-text-inventory.test.mjs` 保留可配置文字和 renderer 字面文本一致性检查；`tests/glyph-inventory.test.mjs` 独立确认四个 SC face 都缺 U+0639，再要求合法 presentation 经真实 QA 被拒，当前姓名与已解析句子进入清单，原配置/时间轴/编辑稿字节保持不变。教训：Unicode 合法性、字体覆盖与阅读可用性是不同合同；任何新增 SC 光栅可见文本入口都要进入字形清单，不能靠别的入口已有覆盖宣称完整。HTML 播放器由浏览器字体绘制的文字不在该 SC 光栅清单范围。
- **新轮-4：对照板 heading 不能硬编码 style ID 选字体。** [审查复现](https://github.com/trainMyBrain233/game-theory-studio/pull/4#discussion_r4226935763)把 textbook 的 `titleFamily` 改为 serif，两张静帧标题变为宋体，对照板标题却仍为 Sans。`design/render-proposals.mjs` 让真实 CLI compositor 与测试共用 `drawComparisonHeader`，heading 消费 `S.titleFamily`，subtitle 保留自身 Sans 合同。`tests/proposal-header-boundary.test.mjs` 覆盖三种样式默认/翻转配置的实际 `ctx.font` 调用；`tests/proposal-header-canvas.test.mjs` 使用有界 header strips，独立绘制期望字形，对照默认→另一 family→还原的应用字体和像素，检查标题确实变化、还原像素一致、subtitle 不随之变化。教训：同一配置要驱动所有派生版式，bounds 声明本身不能证明最终字形实际使用了配置字体。
- **新轮-5：公共 ZIP 生产者必须在写入前拒绝跨平台危险成员名。** [安全审查复现](https://github.com/trainMyBrain233/game-theory-studio/pull/4#discussion_r4226926781)是 POSIX 上合法的含反斜杠文件名，打包后在把反斜杠当分隔符的 Windows 解压器中归一化到目标目录外；解压后再运行 verifier 已经太晚。`production/pack_source.py` 对完整 Git 候选名称列表先做可移植规范路径验证，再选择/读取源文件、创建 manifest 或临时 ZIP；`production/verify_source_archive.py` 保留独立但一致的拒绝规则，不引入归档提供的验证代码。候选规则包括非规范相对路径、反斜杠、盘符/UNC/ADS、控制字符、Windows 禁用字符/设备 basename、尾点/尾空格、根 manifest 名称别名，以及按路径分量 NFC→casefold→NFC 比较的文件/目录身份碰撞；保留合法中文文件名。`tests/test_source_archive_paths.py` 检查 producer/verifier 一致性、先拒绝再访问、失败不替换现有 archive、不回显 payload、优化模式和合法源码包；恶意名字仅用 ZIP 元数据及内存归一化建模，从不实际越界解压。教训：发布方必须在分发前保证成员路径安全，解压后完整性检查不能回溯阻止越界写入；该合同不覆盖 legacy short-name aliases 或解压器特有的解码/变换，也不是对任意第三方解压器的安全认证。

**冻结候选的专项证据：** 收益 action 新增测试 74/74 通过，旧实现对同组测试失败 50/74，证明负例命中原缺陷；含该组的数据/帧窗口/源码身份组合检查 201/201 通过，`qa:data` 与 `qa:source` 通过（Debian 13 x64、Node 24.19.0、Python 3.12.14）。几何/字体选择无原生依赖组合检查 9/9 通过；真实标题字形像素测试 1/1 通过（3.64 秒，Linux、Node 24.19.0），仅使用三种样式的 3840×180 header strips，没有完整场景或素材渲染。字形清单已复现旧 229 字符 QA 漏过 Arabic 姓名，新真实 cmap 负例按预期拒绝且保持 authored 数据只读，3 项纯清单/字面文本一致性检查通过；默认 `qa-fonts.mjs` 加 `qa_glyphs.py` 正常退出，扩充后 560 个唯一字符在全部四个 SC face 中有覆盖，实际字体/像素差异与系统字体隔离检查通过。ZIP 路径最终 10 项通过，已有公开边界 21 项、SVG 7 项与 publication 14 项回归通过，`qa:source` 扫描 270 个候选通过；Python 媒体合同 4 项也通过。这些组互有覆盖，不能相加成完整工程测试总数；字形存在、有限标题条带与纯路径测试不代表整片已验收。

**仍待完成：** 上述代码候选已冻结，最终修补 head 的干净完整双平台 CI 和复审仍待完成，审查项未关闭。这里没有新增私有影片、自然手势、完整编码/解码、真人同步或平台播放接受结论。

### `a7b6fb4` CI：路径身份与负例必须命中真实失败边界

`a7b6fb4bd71fd2ec0fc05d9a05b2ec6f6cdc341b` 的 [Quality run](https://github.com/trainMyBrain233/game-theory-studio/actions/runs/37889790398) 双平台字体及 560 字符覆盖通过，但整体失败。macOS 的 603 项 JS 测试为 602 通过、1 失败，停在解释器路径测试，Python 组未到达；Ubuntu 的 603 项 JS 与 83 项 Python 通过，后续公开 animatic、设计/渲染、changed-case reuse 及 episode model smoke 通过，之后在 `verify-private-routing.mjs` 的隔离子进程报 `Missing fontTools`。两个平台的联系图及最终源码 QA 均跳过，不能把前面通过的阶段当成完整 CI。

- **默认解释器比较实际文件身份，显式选择保留原值。** macOS 临时目录的 `/var` 与 Node 导入解析后的 `/private/var` 指向同一目录；`tests/font-mutation-interpreter.test.mjs` 原用不同拼写做严格比较而误报。仅把默认 `.venv` 期望值改为 `realpathSync`，显式 `PYTHON` 字符串仍原样传递，不放松 loader 断言。Linux symlink 目录复现了旧失败；修后四种路径/选择正例、缺失 PYTHON/错误同 basename 解释器/错误规范化显式路径三种负对照通过。教训：不能用平台路径拼写差异误判依赖丢失，也不能借修测试悄悄重写调用者的显式选择。
- **路由负例必须在导入成功后到达图片解码拒绝。** `production/assets/verify-private-routing.mjs` 现向两个 fixture 子进程显式传入所选 Python；真实失败报告 status、signal、spawn error 和输出。公共占位负例要求先成功导入并验证字体，再在首个人物素材收到 Canvas 1.0.10 实际的 `InvalidArg` / `Unsupported image type`，并核对退出码 1 和专用确认 marker；任意非零退出、缺 fontTools、信号终止或启动错误均不能冒充该负例通过。`tests/private-routing-boundary.test.mjs` 保留上述边界与解释器传播检查。已确认 fallback Python 无 fontTools 的环境中，修前可复现缺依赖，修后八个原创 RGBA 层的私有路由正例及损坏公开 SVG 的精确拒绝均通过；这验证资源路由，不代表真实私有角色或影片验收。

两项修补已冻结，组合的 2 项纯边界测试、语法、差异和源码检查通过；未在本地重复完整 CI。该 head 的[安全复审](https://github.com/trainMyBrain233/game-theory-studio/pull/4#issuecomment-6075146037)于 2026-10-09 05:49:24 UTC 报告无新增安全问题，代码复审随后结束并提出下节六项 P2。该 CI 修补记录形成时下一 head 尚未发布；安全复审无新增问题不等于代码复审通过，最终修补 head 的完整双平台 CI 与复审仍待确认，不能称为全部通过或关闭全部审查项。

## PR #4 `a7b6fb4` 六项补充：动作、对照板与归档生产者

记录日期：2026-10-09（UTC）。对 `a7b6fb4bd71fd2ec0fc05d9a05b2ec6f6cdc341b` 的[代码复审](https://github.com/trainMyBrain233/game-theory-studio/pull/4#pullrequestreview-5466223605)最终提出六项 P2；同 head 的安全复审无新增问题。以下修补已在本地冻结，专项证据列于节末；前述 macOS 路径/素材路由教训及所有历史回归保留，不能据此关闭外部审查项或宣布最终 CI 通过。

- **补充-1：choices 必须与 `highlight_choices` 双向绑定。** [复现](https://github.com/trainMyBrain233/game-theory-studio/pull/4#discussion_r4227053588)保留 `choices`/`matrix_cell` 却把 action 改为 `note`，会让当前格选择与消费者按 highlight action 查找的段落不一致，最终缺段崩溃。前轮测试错误地把该变异作为合法 note 正例，是测试自身遗漏。`scripts/validate-data.mjs` 现要求 choices 使用 `highlight_choices`，反向也要求该 action 带矩阵格与完整 A/B choices，原收益 action 合同保留。`tests/timeline-score-action.test.mjs` 改为拒绝这类载荷/action 脱节，保留真正不含选择/收益的 note。教训：同类载荷应一起审查消费者的查找条件，修 scores 不能留下 choices 的对称漏洞，更不能用宽松正例固定错误行为。
- **补充-2：固定第一集需要完整且唯一的四格演示及查找锚点。** [复现](https://github.com/trainMyBrain233/game-theory-studio/pull/4#discussion_r4227053615)直接把 RR 收益 cue 整体替换为 note，旧校验只看剩下的 reveal，仍未发现缺格。新增 `validateFirstEpisodeTimeline` 只由 production model 与 `qa:data` 的 `01-four-elements` 调用：六个固定 section、28 个实际 renderer/choreography/actor/checkpoint 段落锚点须唯一且位于正确 section/语义顺序；RR/RB/BR/BB 各有一个完整 choice/reveal 对，收益段身份与 checkpoint 一致，在 score order 后、summary 前按声明顺序出现。固定第一集也拒绝额外带 `matrix_cell` 的 note，避免暗改 focus。`tests/timeline-score-action.test.mjs` 覆盖遗漏、重复、重命名、错 section/action、缺格与多格；真实长名/不对称案例、1.3 倍重定时及 owner 事件换序仍合法。通用 `validateTimeline` 与 `00`/章节模板仍允许只演示一格或无 reveal，不强加第一集结构，也不固定绝对秒数。教训：局部合法不等于消费者所依赖的全局集合完整，应显式隔离固定节目合同与可复用章节合同。
- **补充-3：comparison-only 的四段文字全部纳入字形清单。** [复现](https://github.com/trainMyBrain233/game-theory-studio/pull/4#discussion_r4227053603)把 style name/subtitle 改为 `ع`/`غ`，旧 560 字符 QA 仍通过，但对照板缺字。`design/comparison-board-text.mjs` 现在是配置 heading、subtitle、两条 scene caption 共四个 text run 的纯数据来源，实际 renderer 与 `typography/qa-fonts.mjs` 同时消费。`tests/proposal-board-text.test.mjs` 与 `tests/proposal-board-glyph-inventory.test.mjs` 检查所有样式的当前配置和两条 caption，并让真实 cmap 负例到达缺字拒绝。教训：只收集 `drawScene` 文字会遗漏 compositor 新增的字；完整清单应共用实际文字计划，不能不断增加另一份硬编码列表。
- **补充-4：对照板测量结果必须用于拒绝溢出/碰撞。** [复现](https://github.com/trainMyBrain233/game-theory-studio/pull/4#discussion_r4227053605)中 schema 合法的 100 个“甲”标题超出 3840px 画布，旧 compositor 丢弃返回 bounds 后照常写 PNG。`drawComparisonHeader` 现在将四段实际测量框交给 `checkTextLayout`，在 3840×200 header 区域检查边界与互相碰撞；真实 CLI 先 preflight 全部样式，再创建目录/输出文件，实际 board 绘制时再次检查后才写 PNG。`tests/proposal-board-output-boundary.test.mjs` 保留 clipping/collision、失败不新建/覆盖产物的负例；实际字族/像素变化回归继续保留，不缩小请求字号掩盖问题。教训：测量必须参与控制输出的判定，记录 bounds 却不检查并不构成布局 QA。
- **补充-5：ZIP 生产者的 CRC、内容与容量检查不可使用 `assert`。** [复现](https://github.com/trainMyBrain233/game-theory-studio/pull/4#discussion_r4227053596)在 `-O`/`PYTHONOPTIMIZE` 下连 `archive.testzip()` 都被移除，旧包可被未经验证的结果替换却仍打印 CRC checked。`production/pack_source.py` 改用显式失败检查 CRC、无重复/无缺失/无额外成员、payload 与 manifest 的完整字节读回，以及严格小于 15 MiB 的最终 ZIP；只有通过后才原子替换，失败清理临时 ZIP 并保留既有常规文件。`tests/test_source_archive_integrity.py` 覆盖普通 Python、`-O`、`-OO`、`PYTHONOPTIMIZE=1/2`，容量边界采用有界 mock。教训：生产者与解压后 verifier 都是信任边界，不能只修其中一边；优化选项不能改变发布检查是否执行。
- **补充-6：Git 候选不得先过滤，再宣称完整可复现。** [复现](https://github.com/trainMyBrain233/game-theory-studio/pull/4#discussion_r4227053619)中的断链/目录 symlink 被 `is_file()` 静默删掉，归档既不完整却可能标为来自干净 commit。生产者现先对全部候选和父组件做 `lstat`，拒绝链接/junction、特殊文件、目录及缺失路径，再读取受限大小的字节；有意删除跟踪文件须先暂存删除。捕获的 payload 另跑源码边界检查，发布前复核成员、provenance、文件类型与字节。为防 Git status/mtime 缓存或隐藏索引修改导致假 clean，独立把全部捕获成员和原始 Git blob hash 与记录的 HEAD tree 比较，并忽略 replacement refs；不同快照可打包，但明确 `working_tree_dirty=true`、`reproducible_from_commit=false`，不修改索引标记。输出父路径与目标也拒绝 symlink/junction/非正常类型，在创建临时 ZIP 和替换前检查位于 checkout 内。`tests/test_source_archive_integrity.py`、`tests/test_source_archive_paths.py` 保留非正常类型、输出逃逸、变化快照、同长度/mtime 隐藏修改、replacement refs 和合法 round trip。教训：真实捕获字节与 Git 对象身份才支持可复现声明，不能用过滤后的列表或一条 status 推断；路径检查仍假设非恶意并发的本地文件系统，不宣称 descriptor-relative 竞态防护，旧短文件名/解压器特有变换也保持原有限制。

**冻结候选的实际验证：** action/固定第一集专项 131/131 通过；包含该组的数据、帧窗口、checkpoint、源码绑定与 production 轻量组合 258/258 通过，`qa:data` 两章节只读重建一致、`qa:source` 通过，Python 媒体 4 项与 SVG 安全 7 项通过（Debian 13 x64、Node 24.19.0、Python 3.12.14）。对照板有界组合 6/6 通过（22.9 秒），缺字负例复跑 1/1 通过；默认真实字体清单扩充至 579 个唯一字符，四个 SC face 全覆盖。隔离源码副本中的默认和全部 title family 翻转两次真实 CLI 各生成六静帧/三张 3840×1320 对照板，翻转后所有 board PNG 变化，原跟踪产物未写回。归档最终 producer integrity 12 项、路径 10 项、已有边界 21 项、SVG 7 项、publication 14 项通过，源码检查 277 个候选通过。以上套件有重叠，不相加为完整测试总数，也不移植为下一提交的 CI 结果。

**仍待完成：** 最终修补 head 的完整干净双平台 CI 与复审仍待确认；没有新增私有角色、完整影片、编码/解码、真人声画对齐或平台播放验收结论。

## PR #4 `8d16056`：绿色 CI 后自动复审新增 4 项

记录日期：2026-10-09（UTC）。`8d16056e89f2b7c518d7c82f59e09596f5e9d99d` 的完整 [Quality run](https://github.com/trainMyBrain233/game-theory-studio/actions/runs/37892446751) 已通过，Ubuntu/macOS 各 665 项 JS、95 项 Python；579 字符字体覆盖、案例复用、公开渲染/episode、素材路由和最终源码检查通过，联系图按工作流仅在 Ubuntu 执行并通过完整图片解码。该 head 的[手动代码复审](https://github.com/trainMyBrain233/game-theory-studio/pull/4#issuecomment-6075549155)与[手动安全复审](https://github.com/trainMyBrain233/game-theory-studio/pull/4#issuecomment-6075552420)均无新项。随后 06:24:55 从 draft 改为 ready 实际触发了另一轮自动审查：自动安全于 06:32:51 完成且无新项，自动代码于 06:36:11 提出以下四项 P2。因此旧 green CI/clear review 仍是该次执行事实，不能覆盖后到的新发现，也不表示 PR 已合入 main。

- **自动-1：字形检查的 `assert` 在优化模式下会消失。** [发现](https://github.com/trainMyBrain233/game-theory-studio/pull/4#discussion_r4227338551)针对 `scripts/qa_glyphs.py`；普通 Python 下会拒绝的缺字、错误家族/字重、不完整字库或 checksum，原来可能在 `-O`、`-OO` 或 `PYTHONOPTIMIZE` 下漏过。冻结候选改用显式 `ValueError`，并同步审查 `production/qa/check_fonts.py` 和 `scripts/qa_font_provenance.py`：production 字体检查继续调用既有 `verify_cached`，provenance 回归自身必须拒绝伪造被接受、错误诊断、manifest 被改写及恢复失败，不能只测试正常退出。`tests/test_optimized_validation.py` 对四个 face 逐项改变 family/weight/subset/hash/cmap，验证错误不会写出新的成功报告，且这些拒绝在五种启动模式都存在。教训：扩大 inventory 与真实来源检查还不够，执行模式不应取消其拒绝分支；受控字体表/验证器替身证明控制流程，不能冒称新一轮真实字体光栅验收。
- **自动-2：媒体元数据和完整解码检查同样不能依赖 `assert`。** [发现](https://github.com/trainMyBrain233/game-theory-studio/pull/4#discussion_r4227338558)针对 `production/qa/media_contract.py` 与 `production/qa/verify_media.py`。冻结候选将视频/音轨数量、编码、帧率/帧数/时长、尺寸/像素比例/色彩、音频采样率/声道及流起止检查改为显式 `ValueError`；解码非零退出、stderr 或缺失/错误最终帧数用 `RuntimeError` 失败，不继续生成成功报告。`tests/test_optimized_validation.py` 用真实 QA 入口与受控 ffprobe/ffmpeg 输出覆盖五种启动模式的正反例，保留 1080p/4K、无音轨/mono/stereo 等支持情形；原媒体合同测试更新为明确异常类型。教训：必须证明执行到目标解码拒绝，不能用另一个前置错误替代；此处没有新编码或实际视频完整解码证据。
- **自动-3：合法片尾子帧时间不能被夹到最后一个 30fps 采样点。** [发现](https://github.com/trainMyBrain233/game-theory-studio/pull/4#discussion_r4227338570)针对 `production/src/scenes.mjs`：原实现把所有晚于 `DURATION - 1/30` 的时间压到同一点，即使输入仍在 `[0, DURATION)` 内。冻结候选逐值保留该区间的有限时间；负数取 0，等于/超过 DURATION 的有限值才取 `beforeEnd(DURATION)`，即结束点的 Float64 前驱。`production/src/frame-time.mjs` 与 checkpoint 共用该 helper，避免固定 epsilon 跨过纳秒或单 ULP 尾段；非有限/可强制转换输入及非法画布仍在触碰状态前拒绝。`tests/scene-tail-time.test.mjs` 与 recording loader 运行真实 drawFrame、subtitle、matrix 消费者，检查实际下传时间、字幕、alpha、进度线、manifest 身份和正/逆序重复状态；.02 秒、1ns、单 ULP 尾段及越界都覆盖。恢复旧 clamp 后五个消费者测试全部失败，helper 单测仍过，证明回归不是只测新 helper。教训：视频帧量化不能改写直接时间 API 的合法输入；记录式绘制检查不等于真实像素/字体或整片验收。
- **自动-4：对照板 caption 的原尺寸过小，缩小后更不可读。** [发现](https://github.com/trainMyBrain233/game-theory-studio/pull/4#discussion_r4227338577)针对 `design/comparison-board-text.mjs`：两条 scene caption 原为 25px，3840px 图缩至 1920px 宽只剩 12.5px。冻结候选改为 60px/700 的 GameTheory Noto Sans SC，半尺寸为 30px，基线 y165；分隔线移至 y125，200px header 和 3840×1320 board 尺寸不变。纯计划与真实 Canvas 回归检查全部三种样式、两种 title family，保留真实 `ctx.font`、独立字形/半尺寸像素、越界和文本碰撞负例。默认及明月/青禾、合作/退出、不对称收益、默认 BR 变体各输出三板，36 个场景/选择量测通过，12 张原尺寸/半尺寸截图已实际查看；caption 字形上沿 y138.1/139.1、下沿 y197.1，保持在 header 内，距分隔线下沿 y126 至少 12.1px。教训：字形存在与框不碰撞不能替代缩小阅读验收；字号改变后还要复核相邻图形与保留布局。此次只接受 caption 布局和文本边界证据，既有 changed-bright 得分框文字偏挤、editorial 行标签附近图形较近的观察未在此修补，不宣称全图形净空已验收。

**已冻结专项证据：** 五个 Python QA/生产脚本的同一生产实现通过完整 Python suite 100 项（66.303 秒，Linux、Python 3.12.14）；随后仅补测试的 4K/mono 正例与安静输出，最终优化模式专项 5 项重新通过（2.121 秒），其中跨进程检查覆盖普通、`-O`、`-OO`、`PYTHONOPTIMIZE=1/2` 五种启动模式，每模式执行四套行为 fixture。该优化模式专项使用受控字体表、FFmpeg 与 setup verifier 替身，但真实执行文件 hash、manifest、报告及 QA 控制流程；专项自身没有跑真实字体/视频任务。尾时间与既有边界/比例/窗口/checkpoint 组合 26/26 通过（Linux 6.18.44 x86_64、Node 24.19.0），无原生渲染。Caption 的纯测试 3/3、真实 Canvas 测试 3/3 通过（Linux、Node 24.19.0），原尺寸/缩小截图与变体范围见自动-4。这些结果绑定基于 `8d16056` 源码的未提交候选，不能写为下一提交已通过。

**补充集成执行边界：** 本地另有 28 项纯集成检查通过，default-textbook 半尺寸图已再次查看，无 caption 碰撞。随后完整 `qa:fonts` 实际退出 1：准备字体只读验证、真实 SC runtime/specimen 和重新刷新后的 579 字符四 face 覆盖已通过；进入 `qa_font_provenance` 后未出现该阶段成功或异常文字，也未进入 font-mutations，原因未明，不猜测或重复重型执行，不将整条命令记为通过。更早单独读取旧 text-runs 得到的 560 字符不作为最终覆盖结论；production `check_fonts` 单独运行缺少上游 `qa/checks.json`，属于不完整调用前置条件，既不是通过结果，也未据此认定代码缺陷。最终干净 CI 仍须按完整顺序覆盖 provenance、font-mutations 和 production 字体检查。

**当前状态：** 四项候选代码与上述专项证据已冻结，外部审查项尚未记为关闭。最终新 head 的完整双平台 CI 与复审仍待重新绑定并完成；本次不新增私有角色、整片编码/解码、真人同步或播放端验收结论，也不表示 PR 已合入 main。

## 桌牌与手势仍 OPEN

| 项目 | 当前证据 | 关闭条件 |
| --- | --- | --- |
| 桌面/牌支撑 | `design/experiments/tabletop/` 提供连续牌槽、独立牌座、平放三种同镜头比较；休止/放回底边与支撑几何一致 | 选定方案，以真实素材检查承重、桌前缘/身体遮挡、支撑接触、非握持净空、所有四选择及中间/相邻帧 |
| idle 悬爪/固定握姿 | 公共原型沿用静态原创手；没有注册真实 relaxed/grasp 手图；抬牌帧只画拟接触标记 | 实际 idle 有桌面接触；reach→grasp→place→release 的真实姿态、速度与停顿自然，不能用无挡字或 IK error=0 关闭 |
| 腕点稳定与袖口连续 | 实验接口要求 wrist 与 pose contact 分开，裁切平移不改相对偏移；无注册锚或 IK clamp 拒绝接触声明 | 每个真实手姿登记同一腕点、袖口接缝，换姿不使前臂末端跳动；两个策略都能触及近侧上角 |
| 手/牌深度 | 计划 forearm/rear-palm-thumb → card → front-fingers；尚未接生产图层 | 实际前后层、拇指/前指、掌部与卡边可辨；转场全过程不穿插或消失 |
| 名字/头像/header | 草稿配置使用普通僵尸/路障僵尸，公共预览复用原人物头，不显示 A/B 字母；系列/集数/标题可配置 | 私有生产复用批准头层，保留完整路障轮廓；人物、行/列头像、数对顺序一致；真实 alpha 净空、缩小阅读及新稿时间轴全部验证。候选 header 仍待文案确认 |

## 验证与发布记录规则

- 报告绑定实际 commit、输入指纹、字体 manifest 和输出；旧通过结果不移植到新 HEAD。
- 朝向、人物/道具净空、idle/reach/grasp/place/release 分项记录；公共素材与真实素材分别记录。
- 文本、符号、路径与图像像素分开验证；声明、端点距离或 CI 通过不等于美术验收。
- 编码后提取关键帧并完整解码；原速观看、试听、声画对齐和实际平台播放未做则标待验。
- `npm test` 是工程入口。新增条目写实际执行范围，不能把本页当作本轮整片通过报告。
