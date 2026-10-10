# 第三方内容与源码边界

系列视觉角色方向已选择《植物大战僵尸》的僵尸，普通僵尸A/路障僵尸B的真实分层视觉预览已在云端私下生成并验收（已验证来源为f694678，后续修复head需重验）。A/B是通用参与者、布局和收益顺序接口，不等同于某个已完成的角色素材。

本MIT源码仓库不包含EA游戏角色位图、截图、提取资源或重绘图，也没有用MIT条款重新授权第三方角色。归档目录中的人类、动物、机器人为历史原创方案，未选为当前主角。

参考：[EA官方内容政策](https://help.ea.com/en/articles/security-and-rules/ea-content-policy/)。游戏内容用于视频，与向他人分发可复用素材是不同的使用情境；应在具体发布/素材分发前核对当时政策及适用权利。本项目不对任何用途作许可或法律合规保证。

`assets/characters/cast.json`仅记录通用角色接口和方向状态，`activeCast`与`asset`保持空值。私有视觉预览没有真人配音/实际音频对齐；八层素材、视频及对应验收产物另行管理，不以源码仓库中的占位人物冒充最终角色。


## Unicode 15.0 属性数据与生成工具

`scripts/unicode-text-15.0.0.json` 和 `scripts/build_unicode_text_data.py` 中的 `IGNORABLE` 范围包含从 Unicode 15.0 派生的属性数据。这些数据保留[完整 Unicode 数据许可声明](licenses/Unicode-15.0.0.txt)，不能仅用仓库 MIT 条款重新授权。项目原创生成器和文本契约实现仍由根目录 `LICENSE` 覆盖；发布数据及派生范围时应一起保留上述声明。

许可文本核对自 Unicode 官方 [ICU release-72-1 的 LICENSE 第一节](https://raw.githubusercontent.com/unicode-org/icu/release-72-1/icu4c/LICENSE)（1991–2022）；同一 release 的 [DerivedCoreProperties.txt](https://raw.githubusercontent.com/unicode-org/icu/release-72-1/icu4c/source/data/unidata/DerivedCoreProperties.txt) 明确标记为 Unicode 15.0.0、2022。当前 `unicode.org/license.txt` 已是较新的 V3，不作为本次历史声明的替代。具体转换范围和重建方法见[共享文本契约](../scripts/unicode-text-contract.md)。

生成器通过 Python 的标准 `unicodedata.category()` API 读取属性。[Python 3.12 官方文档](https://docs.python.org/3.12/library/unicodedata.html)确认该版本使用 UCD 15.0.0。本源码归档没有复制 CPython 实现代码、内部生成表布局或分发 Python 解释器；这里按 Unicode 数据来源保留数据声明，并记录 Python 为构建工具。此判断限于当前归档边界，不表示 Python 源码或二进制没有许可要求：如以后打包 Python/CPython 派生发行物，须另外按 [PSF 许可](https://docs.python.org/3.12/license.html#psf-license)保留对应版权和许可。
