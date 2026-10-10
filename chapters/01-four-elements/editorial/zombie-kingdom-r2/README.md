# 僵尸王国第一集 r2 编辑草稿

版本 `zk01-narration-draft-2026-10-08-r2`。已登记于隔离实验分支；供进一步审核，**没有用户逐字批准、真人录音或声画同步**。当前根案例解析后为 40 个语义块、646 个口播字符；原 37 段完整映射。口播只有参与者、信息、策略、收益四问，单轮同时行动，规则公开；多轮仅作对照后回到本局，不预测均衡或新立项。

`修改说明_含原段ID映射.txt` 保留收到的写作交接正文，其中“未入库”等描述属于写作阶段历史状态；本页记录当前实验分支登记状态。正式生产文件仍未覆盖。

完整口播取自委托消息的原段映射。最初消息的语义 JSON 被截断，后续四批按 ID 补发已覆盖全部 40 块的强调、换气和画面备注。`source_metadata_status` 当前为已补齐，`source_metadata_history` 保留截断与补齐历史；没有补造缺失内容。b14 的三段字幕建议保留，全部 timing 为 null，最终换屏与停留长度待实录。备注描述制作意图，不代表动作已实现。

唯一可编辑口播源是 `blocks.template.json`。人名、系列、头像绑定复用 `design/experiments/tabletop/presentation.json`，策略与收益读 `design/scenes.json`。数值用中文口播；对称“各得”在不对称收益下自动展开为双方全名，不会保留旧三/零/五/一。标题目前仍是候选。

```sh
node chapters/01-four-elements/editorial/zombie-kingdom-r2/build.mjs
node chapters/01-four-elements/editorial/zombie-kingdom-r2/build.mjs --check
```

第一条显式更新本目录三个派生产物；第二条只读比较，过期即报错。`第一集_提词器净稿_r2.txt` 只有逐段正文，不朗读标题、ID、备注、时间码或术语备考。构建不触碰正式 `narration/timeline.json`、字幕或既有录制包。旧“小A／小B”材料属于 legacy 版本，不再代表本次新命名要求；不可混用旧正文和新提示。

两种命令都会先验证字幕建议：每组 `suggested_lines` 必须一字不差地拼成 `spoken_span`，各组再完整拼成块口播。每组一至两行、每行最多 22 个可读 Unicode 字母或数字，只能在子句标点后换行／换组；当前角色名、策略名及对应选择／收益子句不能拆开。模板只允许已定义的自身 token，未知 token 和 `constructor`、`toString`、`__proto__` 等原型属性明确报错；验证失败不会写出任何派生产物。

原稿及草稿的 `spoken_character_count` 指标都复用 [Unicode 15.0.0 文本合同](../../../../scripts/unicode-text-contract.md)中的 L*/N* 码点计数。重音字母、扩展汉字和非 ASCII 数字计入，组合符、符号、标点与空白不计入；补充平面的一个字母或数字仍只算一个码点。这不是字素数、真实语速或片长预测。`tests/editorial-unicode-metrics.test.mjs` 通过真实重建和独立的八码点样本检查两个指标。

自然试读后再人工建立新参考时间轴，真人录制后重定时。字符增加不等于按比例预测片长，禁止硬塞旧 174.1 秒。植物以后可以加入；田忌赛马只是举例，本次不新建章节或重渲整片。

“支付”保留为 payoff 译法备考，观众口播只用“收益”。放松/夹持手、真实头像净空、桌牌支撑及七状态动作仍见[质量回归记录](../../../../docs/quality-regressions.md)中的 OPEN 项。
