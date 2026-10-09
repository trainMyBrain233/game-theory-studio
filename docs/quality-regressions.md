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

记录日期：2026-10-09（UTC）。后续审查针对 `a153` 的 production 内容；最新已发布 head `b2dbc6f58f052e01daf5fc5a28dd379344d2c1f9` 保留相同 production 内容，虽有绿色 [Quality run](https://github.com/trainMyBrain233/game-theory-studio/actions/runs/37886242723)，仍被以下五项阻塞。本节补充而不替换前两轮 18 项；上节执行范围是当时记录，不能当作这些新候选修补的通过证明。以下按当前未暂存实现及测试记录复发教训，字体候选现已冻结并完成下述专项验证，最终集成、绑定新 head 的干净 CI 及复审仍未完成，不能称为全部接受或问题已关闭。

- **后续-1：presentation 入口也要执行归一化后的姓名唯一性。** 只比较原始字符串，会让 `Ａ/A`、`é/é`、`Ⅻ/XII` 或只差空格形式的两个名字在桌牌与编辑稿适配后失去可区分身份；主案例已有校验不代表旁路入口受保护。`design/experiments/tabletop/presentation.mjs` 的候选实现对 A/B 名字调用共享 `normalizedLabel`，先要求可见、已去首尾空白、Unicode 15.0 支持范围内的单行标签，再按 NFKC 与空格折叠结果判重；显示文本仍保留作者原始码点，不改案例、玩家归属或输入对象。`tests/presentation-unicode.test.mjs` 保留兼容/组合字符与空格碰撞、默认忽略字符、仅符号/组合符、非法/表外字符负例，以及不同中文名、扩展汉字、重音与标点姓名正例。教训：共享合同必须覆盖每个配置适配入口，Schema 限长和原始字符串不等都不足以证明身份可区分；合法字符仍需另验字形与布局。
- **后续-2：编辑稿指标不能另写一套 BMP/ASCII 计数器。** 原稿与草稿的 `spoken_character_count` 仍用基本汉字加 ASCII 正则时，重音字母、扩展汉字与非 ASCII 数字会漏算，即使字幕校验已使用新合同。`chapters/01-four-elements/editorial/zombie-kingdom-r2/build.mjs` 的两个指标改用共享 `readableCount`，定义明确为固定 Unicode 15.0 的 L*/N* 码点数；补充平面字母/数字各算一次，空白、标点、组合符和符号不计入。`tests/editorial-unicode-metrics.test.mjs` 用独立八码点样本、真实叙述/编辑稿重建及旧正则低估负对照覆盖两项指标，并保留当前案例与无时间码状态。教训：派生指标也属于跨入口文本合同；字符数量不是字素数、自然语速、预测片长或真人音频对齐，不能据此重写正式时间轴。
- **后续-3：原生字体注册前必须验证真实字节、独立来源与别名所有权。** 直接渲染原来只检查文件存在及 family 的 400/700 声明，未必先执行 `qa:fonts`；同时伪改字体与 manifest 的 hash，或预注册同名错误字体，都可能绕过准备阶段的信任边界。当前字体候选由 `typography/font-provenance.mjs` 和 `typography/verify-fonts.py` 在注册边界只读复用 `setup_fonts.verify_cached()`：官方固定 SHA，或原 TTC 源 SHA/face index 的独立重提，以及 SC 家族、版本、真实字重和字库合同。证明缓存绑定实际字体、manifest、验证代码及原 TTC 源字节，不能仅依路径、大小或 mtime；Canvas 接收重新核对摘要的内存 buffer，不在逐帧绘制中读盘或启动验证。`typography/font-registration.mjs` 持有原生 FontKey，拒绝未经持有的同名 alias；重复调用只续注册自身 keys，并检查外部移除、替换、混入及失败回滚，合法字节更换也要求新渲染进程。`tests/font-registration.test.mjs`、`tests/font-provenance-cache.test.mjs`、`tests/test_font_registration_verifier.py` 提供无真实字体的所有权/缓存/只读适配回归；`tests/font-registration-provenance.test.mjs` 另保留静态与 production 直接入口、联合伪改、原 TTC 变更和真实原生别名负例，该真实字体/原生注册专项已在冻结候选上串行通过 4/4（16.3 秒，Linux、Node 24.19.0、Python 3.12.14），覆盖自有 keys 与无关 alias 保留、禁用 Python 后复用既有字节证明、直接 import 拒绝伪造字体及 manifest、原 TTC 源与 face index 负例；无真实字体的 Node 核心/模拟 11 项和 Python 适配 3 项也已通过。最终 head 仍须重新绑定完整验证，不能把专项结果移植为新提交通过。教训：声明与自报 hash 不能证明来源，已有 family/字重列表不能证明原生对象属于本模块；只读验证不得下载、修复或重写 provenance，工程合同也不代替 SC 字形与缩小阅读验收。
- **后续-4：Python 媒体 QA 必须与 JS 编码器在半帧处同舍入。** 30fps 下 0.15 秒和 0.35 秒，JS `Math.round` 产生 5/11 帧，Python `round` 的 ties-to-even 却期待 4/10 帧，合法输出因此可能被误拒。`production/qa/media_contract.py` 的候选 `video_frame_count` 与 JS `videoFrameCount` 统一有限正数、binary64 乘积、非负精确半值向上，以及至少一帧/安全整数上界；拆开整数和小数部分判定，避免 `floor(product + 0.5)` 把半值前一浮点数或最大安全整数再舍入错。媒体时长预期继续由 `frames / fps` 推导。`tests/fixtures/video-frame-count-contract.json`、`tests/media-frame-count.test.mjs`、`tests/test_media_contract.py` 共享明确期望，覆盖奇偶半值及相邻可表示值、亚帧、非整数 fps、安全整数边界、溢出/下溢及非法类型，并拒绝旧 4/10 帧元数据。合同见 `production/qa/frame-count-contract.md`。教训：跨语言默认舍入不是同一合同，不能只测整秒；纯计数/元数据样本不证明实际编码、完整解码或声画同步。
- **后续-5：SVG 要限定精确 namespace 与完整静态元素白名单。** 仅检查标签 local-name 的危险列表会漏掉外来 HTML `iframe` 的转义 `srcdoc` 内容，文件里没有直接的 SVG `script` 也不安全。`scripts/qa_source.py` 的候选 guard 对每个元素只接受精确、区分大小写的 `http://www.w3.org/2000/svg` namespace 或无 namespace，并要求属于 `STATIC_SVG_ELEMENTS` 的固定形状、定义、文字与局部引用子集；前缀不改变 namespace 身份，未知或未来元素即使在 SVG namespace 中也拒绝。完整子集与兼容的 local-name 大小写行为见 `docs/public-source-boundaries.md`。`tests/test_public_source_boundaries.py` 的 `SvgNamespaceBoundaryTests` 覆盖 HTML iframe/srcdoc、外来默认/前缀/nested namespace、近似 URI、SVG/无 namespace 的未知标签，保留原创静态元素、局部引用与合法 namespace 重置正例，并检查 CLI/优化模式归档失败不回显 payload；样本只解析，不打开、渲染或执行。教训：信任边界要用允许范围封闭定义，不能靠不断加危险标签补洞；这个公开源码静态子集仍不是通用 SVG sanitizer。

**本次记录的验证边界：** 此文档更新本身只核对源码、测试定义与文档差异；字体冻结候选的实际专项执行范围与运行时见后续-3，不将 Node 核心/模拟、Python 适配和原生套件相加成完整工程通过数。`b2dbc6f` 的绿色 CI 不包含这些后续未集成修补的接受结论。最终提交的完整 `npm test`、案例复用、干净双平台 CI 及复审仍待确认；已过字体专项也需与最终 head 对齐。这里记录公开工程验证，没有新增私有影片、自然手势、完整编码解码或真人音频验收结论；相关 OPEN 项保持原有边界。

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
