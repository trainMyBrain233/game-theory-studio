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

## 自检

`npm run qa:fonts`：验证4个SC字体；关闭系统自动加载；验证两家族均有400/700，拒绝未注册500；独立检查实际ctx.font的字号、字重和完整家族；同一段文字的400/700和Sans/Serif像素必须不同；强制regular、8px、Sans负例须失败；生成中文字形板；检查实际模板与所有被发现章节文字的cmap覆盖，确认缓存符合独立来源合同。真实字体负例验证“元数据仍合法、文件+manifest同时改hash”不能通过官方pin或TTC重提；临时TTC测试不联网、也不留下字体产物。

输出 `qa/sc-specimen.png`、`qa/text-runs.json`与`qa/glyphs.json`均为本地生成物。缺字检查只能确认字符存在；仍需查看实际字形、字号、重叠和缩小显示可读性。

基础模板为原生1920×1080、40px字幕、30px左右重要标签，普通正文对底色至少4.5:1。正确SC字体、足够字号与字重优先于盲目提高分辨率或码率。字体与路径直接在目标像素绘制，不先生成小位图再放大。

完整视频的编码后抽帧、压缩字体边缘、转场字幕停留和播放端效果仍须在完整导出后验证。
