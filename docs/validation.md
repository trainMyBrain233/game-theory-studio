# 基础版本验收

验收日期：2026-10-08。当前范围是可复用基础源码、静帧模板、角色提案与人工口播时间轴；不是完整视频验收。

## 已运行

- `npm ci --ignore-scripts`：从根目录lockfile重新安装成功；未依赖其他工程的node_modules链接。
- `npm run setup:fonts`：从本机Noto CJK TTC按内部家族/字重提取四个完整SC face。Sans 2.004、Serif 2.003；每个字库65,535 glyphs。
- `npm run qa:data`：场景与时间轴两份JSON Schema；故意错误样本拒绝；37个字幕块连续覆盖173.3秒；语音窗与尾停、章节、得分顺序和显出点一致；生成器逐字节重建timeline/SRT/参考稿。
- `npm run qa:fonts`：禁用系统字体加载；明确SC Sans/Serif与真实400/700字重；拒绝未注册字重；实际模板与口播的216个不同字符由四字库完整覆盖；已查看两张B模板与SC字形板。
- `npm run render:proposals`：原生6张1920×1080静帧和3张3840×1320完整对照板。
- `npm run qa:design`：53项通过、0项失败。包含原生尺寸、无裁切/不放大拼板、确定性渲染、文字画布边界、40px字幕、4.5:1正文对比、四种收益组合。
- `npm run render:cast`与`npm run qa:cast`：9个原创SVG可加载，无可见文字节点；三组已归档原创角色的标签净空最小59.8px，高于32px底线。仍是概念图，不是动作绑定完成的生产角色。
- `npm run qa:source`：仅扫描仓库候选源文件，检查常见凭证、私有工作区路径、嵌入图片/脚本SVG、二进制与单文件1MiB限制；并人工审查待提交列表。

测试环境：Linux x64、Node 24.19.0、npm 11.9.0、Python 3.12、fontTools 4.61.1、@napi-rs/canvas 1.0.10。

机器生成的详细报告在`design/qa/`、`typography/qa/`、`assets/characters/archive/proposals/qa/`与`chapters/01-four-elements/narration/qa/`，不提交路径、运行日志或二进制产物。

## 未覆盖与后续验收

- 已选PvZ僵尸角色方向，具体组合/外形仍待制作；未做第三方IP法律许可或商标清查。本仓库不包含第三方角色图像或重绘素材。
- 本地字体提取路径已实际测试；官方网络下载路径需要网络可达，可能受代理、下载或平台限制。
- 没有完整V2导出、真人/TTS音轨、实际音频对齐，也没有全片编码后抽帧或平台播放验收。
- 没有对Windows/macOS执行完整安装与渲染测试。相同字体版本不保证不同操作系统/Skia版本逐像素一致。
- 自动画布边界与对比度检查不等于所有文字彼此无碰撞；新内容、新角色和过渡帧需要逐帧目视检查。
- 凭证模式扫描降低误提交风险，不是绝对无秘密保证；公开前仍需人工审查diff与路径。
- 当前没有配置远程CI。`npm test`的本地通过不代表GitHub Actions已运行。
