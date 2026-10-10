# 视频制作来源登记

核验日期：2026-10-08。以下只记录本指南使用的官方文档、标准制定者资料或原始研究。访问成功不代表内容为所有视频平台的统一法规。网页可能更新，发布前重新核对目标平台条款和实际投稿界面。

## 字体与字幕

- **S01 Noto CJK 官方字体说明**：SC/TC/JP 等地区变体与部署方式。支持明确选择简中字形，不表示所有字重都已在本工程注册。
  https://github.com/notofonts/noto-cjk/blob/main/README.md
  https://github.com/notofonts/noto-cjk/blob/main/Sans/README.md
- **S02 W3C 中文排版需求**：第 6.1.1 节行首行尾禁则、第 6.1.2 节符号分离禁则。属排版需求与风格参考，并非所有字幕平台交付合同。
  https://www.w3.org/TR/clreq/
- **S03 Netflix 简中字幕指南**：其交付场景为每行 16 字符，成人上限 9 字符/秒、儿童上限 7 字符/秒。不是本项目的最佳教学速度，也不是中文口播速度标准。
  https://partnerhelp.netflixstudios.com/hc/en-us/articles/215986007-Chinese-Simplified-Timed-Text-Style-Guide
- **S04 Netflix 通用字幕要求**：两行等字幕交付要求；页面明确适用于为 Netflix 制作的 timed text。
  https://partnerhelp.netflixstudios.com/hc/en-us/articles/215758617-Timed-Text-Style-Guide-General-Requirements
- **S05 Netflix 字幕计时指南**：按音频、镜头和阅读体验人工调整，完整回看。指南中的 24fps 示例须正确换算；本项目不照搬其帧间隔与最短时长规则。
  https://partnerhelp.netflixstudios.com/hc/en-us/articles/360051554394-Timed-Text-Style-Guide-Subtitle-Timing-Guidelines
- **S06 W3C WAI 字幕说明**：字幕为需要理解的语音及非语音声音提供同步文字；纯无声视频与只有背景音乐的情形不同。
  https://www.w3.org/WAI/media/av/captions/

## 认知负荷与动效

- **S07 Mayer 与 Moreno 2003 原始研究综述**：Nine Ways to Reduce Cognitive Load in Multimedia Learning，Educational Psychologist 38(1), 43–52。讨论分段、预训练、信号提示、去除无关信息等。分段实验含学习者控制的继续按钮，不能据此宣称固定视频停顿某秒数已被证明最优。
  https://www.uky.edu/~gmswan3/575/9_ways_to_reduce_CL.pdf
- **S08 Google Material 动效编排**：共享元素与视觉连续性。来源针对界面交互，迁移到教学视频是设计建议。
  https://m1.material.io/motion/choreography.html
- **S09 Google Material 时长与缓动**：时长随距离、速度和元素变化调整；不支持给所有教学动画套统一毫秒值。
  https://m1.material.io/motion/duration-easing.html

## 清晰度与编码

- **S10 Adobe 图像尺寸与重采样**：像素尺寸与打印 PPI 不同；上采样不能找回原图不存在的细节。页面标注更新于 2026-09-28。
  https://helpx.adobe.com/photoshop/desktop/crop-resize-transform/resize-adjust-resolution/image-size-resolution-and-resampling.html
- **S11 MDN Canvas 图像平滑说明**：缩放位图时的平滑开关；像素画关闭平滑具有特殊目的，不能泛用于本项目的平滑轮廓角色。
  https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/imageSmoothingEnabled
- **S12 FFmpeg 滤镜官方文档**：`scale` 的颜色矩阵/范围、`ebur128` 测量与 `loudnorm` 参数。软件手册提供工具行为，不给平台通用响度目标。
  https://ffmpeg.org/ffmpeg-filters.html

## 音频

- **S13 ITU-R BS.1770-5 2023**：节目响度与真峰值测量算法，官方登记显示为现行版本；本身不是“所有平台应交 -14 LUFS”的依据。
  https://www.itu.int/rec/R-REC-BS.1770-5-202311-I/en
- **S14 EBU R 128**：广播节目响度建议 -23 LUFS；适用体系需要确认，不能直接变成B站上传硬要求。
  https://tech.ebu.ch/publications/r128
- **S15 EBU R 128 S2**：串流响度有单独指导，说明广播与不同终端的发行目标不能混同。
  https://tech.ebu.ch/publications/r128s2
- **S16 Audacity 官方录音指南**：先确认输入、监听并试录，示例录音峰值约 -6 dB，为留录制余量的建议。
  https://manual.audacityteam.org/man/recording.html
  https://manual.audacityteam.org/man/tutorial_making_a_test_recording.html
- **S17 Adobe Premiere 自动音乐避让**：按 Dialogue 等轨道类型生成可编辑增益关键帧；语音变化后需重算并试听。页面标注更新于 2026-01-21。
  https://helpx.adobe.com/uk/premiere/desktop/add-audio-effects/adjust-volume-and-levels/automatically-duck-audio.html

## 上传平台与权利

- **S18 YouTube 官方推荐上传编码**：SDR 1080p30 为 8 Mbps、2160p30 为 35–45 Mbps 的推荐值；列出 MP4、H.264、48kHz、BT.709 等信息。页面也有 Content Manager 合作伙伴功能提示；数值不应扩张为任何平台的拒收阈值。
  https://support.google.com/youtube/answer/1722171?hl=en
- **S19 YouTube 官方转码说明**：上传后较低清晰度先可用，高清处理完成后再做播放验收。
  https://support.google.com/youtube/answer/71674?hl=en
- **S20 YouTube 官方音视频问题排查**：检查单声道兼容性、跨浏览器播放和处理状态。
  https://support.google.com/youtube/answer/58134?hl=en
- **S21 B站官方帮助与投稿入口**：实际打开但网页文本读取仅取得空壳，未能核验当前普通视频完整参数。只作为后续核验入口，绝不把空页面当作已验证规格。
  https://www.bilibili.com/blackboard/help.html
  https://member.bilibili.com/platform/upload/video/frame
- **S22 B站官方 Hi-Res 活动页**：搜索索引可读到特定无损编码、至少 48kHz/24bit；直接打开页面未返回可读正文。这是专项活动规则证据，未核实当前活动资格，也不是所有投稿的音频要求。
  https://www.bilibili.com/blackboard/activity-m1vS5T9l2t.html
- **S23 EA 官方内容政策**：涉及个人项目、被动广告/平台伙伴变现例外、禁止数据挖掘取资产、非关联声明及第三方授权边界。说明不等于对本项目作法律许可结论。
  https://help.ea.com/en/articles/security-and-rules/ea-content-policy/

## 未采用的证据

未把B站用户专栏转述客服的 2020–2024 年参数表、所谓“免二压码率线”“抬到某短边必触发4K”等当作官方现行规范。未找到并核实B站面向本项目普通投稿的统一 LUFS 硬值，故保留待核验。未访问用户登录态投稿界面、未上传文件、未验证手机实际平台控件遮挡。
