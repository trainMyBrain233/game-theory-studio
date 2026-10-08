# 故障排查

| 症状 | 检查与处理 |
| --- | --- |
| `Missing fontTools` | 运行 `npm run setup:python`；npm 自动使用 `.venv`。直接调用系统 `python3` 可能绕过虚拟环境。必要时设置 `PYTHON` 为明确的解释器路径，再安装相同 requirements。不要把本机路径提交。 |
| 字体缺失 | `npm run setup:fonts -- --source-dir /path/to/fonts` 支持 macOS/Linux 安装目录或显式目录；无本地字体时用 `--download`。不会回退到系统 sans-serif。 |
| 本机 TTC 版本旧/JP face | 默认离线准备会拒绝错误家族/版本；显式 `--download` 对缺失/无效目标优先使用固定官方完整 SC OTF，不先选旧本机 TTC。有效已准备字体复用；下载校验失败保留已有目标，不伪造 SC 别名。 |
| 官方下载失败/校验值不符 | 检查网络到 raw.githubusercontent.com；不要关闭 TLS 或删掉 checksum 检查。可把同版本官方 OTF 放在显式源目录离线准备。失败临时下载不当成可用字体；官方来源版本与 SHA 见脚本和字体文档。 |
| npm Canvas 原生绑定缺失 | 使用与当前平台/CPU 匹配的 Node，重新 `npm ci --ignore-scripts`。保留 npm optionalDependencies；不要使用 `--omit=optional`，不要复用 Linux 的 node_modules 到 Mac。包锁包含 macOS arm64/x64、Linux glibc/musl 对应预编译包。 |
| 字幕或 timeline 过期 | 编辑本章生成器后 `npm run build:narration -- <id>`；检查 diff 再跑 `qa:data`。QA 不会替你覆盖手改字幕。 |
| 字幕/图文溢出 | 查看报错文字和本地帧。缩短/按语义换行，或显式调整经过验证的布局；不要将所有字号钳制到小值来让边界检查通过。实际 ctx.font 和 glyph 也会被检查。 |
| Schema 报 unknown field/错玩家 | 查对应 Schema 与工程契约。角色 id 只有 A/B；得分 offset 相对段 start，须在发声参考窗内；不能写 C 或把 A/B 收益交换。 |
| 不同 OS 像素不一致 | 先核对字体 manifest、Node、Canvas、CPU/OS；逐像素重复只在同一环境比较。不同平台不要求相同全图 SHA。 |
| 中文 locale/CRLF | 源码与派生文本统一 UTF-8/LF；生成器先校验、暂存，再替换。非 UTF-8 locale 已有回归测试。不要靠手改成 GBK 或去掉字幕中文解决。 |
| GitHub CI 红灯 | 打开当前 head 对应的 Quality run，先查看失败步骤。字体/安装错误与语义错误分开处理；复跑适用本机命令后提交修复。不要扩大 token 权限、增加秘密或改成 pull_request_target。 |

macOS arm64 本机实际跑过完整链；Linux 与 macOS 远程结果以当前 commit 的 Actions 为准。Windows 的路径分支只经过代码检查，没有 Windows 实测或 CI，不能把它列为已验证环境。

如果需要真实整片、配音或 PvZ 角色素材验收，使用对应生产任务的来源/权限记录和完整导出；本工程的静帧及几何烟测无法替代这些检查。
