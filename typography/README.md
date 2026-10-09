# 中文字体与可重复渲染

所有渲染统一导入 `fonts.mjs`。先注册明确的完整SC OTF，再用 `canvasFont()`指定真实400/700字重；禁止把多地区TTC直接起一个SC别名，也不使用通用sans-serif掩盖缺失。

项目曾确认，多face TTC在该渲染链路中可能仍读取JP字形，改别名不会改变字形。字体准备脚本按字体内部family与weight找到SC face，完整导出，不做小字库裁剪；不把某台机器的face编号写死。早期 Linux 的 Sans/Serif SC 都是 face 2；本次 Mac 从官方单 face OTF 准备，没有 TTC face 编号。

## 版本与来源

- Noto Sans CJK SC：2.004，Regular与Bold。[官方版本](https://github.com/notofonts/noto-cjk/releases/tag/Sans2.004)
- Noto Serif CJK SC：2.003，Regular与Bold。[官方版本](https://github.com/notofonts/noto-cjk/releases/tag/Serif2.003)
- 依赖：`@napi-rs/canvas` 1.0.10，fontTools 4.61.1。npm包与校验值固定在根目录lockfile。
- 字体许可：SIL Open Font License 1.1；[Sans官方许可证](https://github.com/notofonts/noto-cjk/blob/main/Sans/LICENSE)、[Serif官方许可证](https://github.com/notofonts/noto-cjk/blob/main/Serif/LICENSE)。另保留 [OFL文本](../docs/licenses/OFL-Noto.txt)。项目MIT许可证不替代字体许可证。

默认 `npm run setup:fonts` 只查找本机Noto CJK，提取完整SC face；可重复指定 `--source-dir`。没有字体或版本不符时明确失败。显式 `--download` 对缺失/无效目标优先使用官方完整 SC OTF，绕过本机旧 TTC；有效已准备目标仍复用。下载固定 Sans commit `523d033d6cb47f4a80c58a35753646f5c3608a78`、Serif commit `9b0f1436e455d902de067a2501422e5dc71ad16b`，逐文件校验脚本内固定 SHA256；所有官方OTF首次及缓存复用都核对固定SHA，未知个体OTF不接受；再检查family、版本、400/700、中文覆盖与完整字库规模。下载或校验失败不覆盖已有目标；manifest 仅在完整准备成功后替换。

字体保存在忽略的 `typography/fonts/`。同目录生成manifest，记录版本、prepared SHA256、source_kind、输入SHA和face index。官方OTF的源指纹是固定SHA；本地TTC不与该OTF哈希混同，记录原TTC路径/输入SHA，并每次独立重提完整SC face与prepared字节比较。须保留原TTC，输入或输出变更会失败；显式 `--source-dir` 准备新来源前须审查来源。提取时保留字体源时间戳，避免每次导出因时间变化产生不同字节；`--verify-only` 不写manifest、也不为未知修改重新盖章。旧TTC记录缺少来源指纹时需显式重新准备；官方固定字节可由setup迁移来源记录。

SC完整OTF与从TTC提取的SC在容器结构/校验值上可以不同。需要逐像素复现时，保留同一字体manifest、同一字体文件和同一平台；跨Skia/操作系统版本不承诺完全相同的像素。字体二进制和本地manifest不随源码公开。

## 渲染时注册边界

静态模板和production共用的 `registerFonts()` 在首次注册前也执行只读来源验证，直接复用 `setup_fonts.verify_cached()` 的官方固定SHA／TTC独立重提、SC家族、版本、真实400/700、必要字形及完整字库合同；不依赖之前是否运行过 `qa:fonts`，也不会下载、修复字体或重写manifest。运行渲染仍需准备好的字体、原始TTC（如使用）及Python/fontTools。

每次显式调用 `registerFonts()` 都重新读取字体、manifest与验证脚本的实际字节，并检查已证明的原TTC源字节；相同内容可复用进程内验证结果，不能仅凭路径、大小或mtime命中缓存。Canvas仅接收已核对SHA的内存buffer。`canvasFont()` 与逐帧绘制不做文件读取或Python验证，因此应在渲染任务开始时注册；已开始的任务保持注册时的字体快照。有效字体字节被替换后需启动新渲染进程，避免旧Canvas上下文保留旧typeface。

两个公共family别名由本模块独占。预先存在的未持有FontKey的同名家族，即使有400/700，也明确拒绝。Canvas 1.0.10没有查询FontKey是否仍属于某别名的API；重复注册在边界移除本模块持有的keys，核对移除数量及别名已空后，重新注册同一已验证字节。外部移除、替换或混入同名字体均失败；不改写Canvas全局方法，也不清空其他家族。所有入口继续通过 `--import ./scripts/isolated-fonts.mjs` 在Canvas加载前关闭系统字体。

## 自检

`npm run qa:fonts`：验证4个SC字体；关闭系统自动加载；验证两家族均有400/700，拒绝未注册500；独立检查实际ctx.font的字号、字重和完整家族；同一段文字的400/700和Sans/Serif像素必须不同；强制regular、8px、Sans负例须失败；生成中文字形板；检查实际模板与所有被发现章节文字的cmap覆盖，确认缓存符合独立来源合同。真实字体负例验证“元数据仍合法、文件+manifest同时改hash”不能通过官方pin或TTC重提；临时TTC测试不联网、也不留下字体产物。

`node --test tests/font-registration.test.mjs tests/font-provenance-cache.test.mjs` 使用纯模拟／受控子进程，检查注册所有权、失败回滚及同大小／同mtime修改的缓存失效，不加载Canvas/fontTools。`tests/font-registration-provenance.test.mjs` 随 `test:core` 在字体准备后运行真实负例，覆盖静态／production直接入口、字体与manifest共同伪改、外部同名别名及原TTC来源变更。

输出 `qa/sc-specimen.png`、`qa/text-runs.json`与`qa/glyphs.json`均为本地生成物。缺字检查只能确认字符存在；仍需查看实际字形、字号、重叠和缩小显示可读性。

字形清单同时包含当前presentation的系列／集标题、人物姓名、矩阵标签／分数，桌牌静态与interaction画面的固定文案、阶段文字，以及只读解析的当前editorial口播／录音提示。清单使用渲染器共享的文案与identityTextPlan，并按当前数据展开editorial，不修改已保存草稿、case或标签。合法Unicode标签仍必须通过四个真实SC cmap；例如当前字体没有的“ع”会明确报缺字，不使用系统回退或语言黑名单。浏览器HTML播放器的系统字体界面不属于SC光栅字形清单。

基础模板为原生1920×1080、40px字幕、30px左右重要标签，普通正文对底色至少4.5:1。正确SC字体、足够字号与字重优先于盲目提高分辨率或码率。字体与路径直接在目标像素绘制，不先生成小位图再放大。

完整视频的编码后抽帧、压缩字体边缘、转场字幕停留和播放端效果仍须在完整导出后验证。
