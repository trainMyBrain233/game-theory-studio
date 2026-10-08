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

自然试读后再人工建立新参考时间轴，真人录制后重定时。字符增加不等于按比例预测片长，禁止硬塞旧 174.1 秒。植物以后可以加入；田忌赛马只是举例，本次不新建章节或重渲整片。

“支付”保留为 payoff 译法备考，观众口播只用“收益”。放松/夹持手、真实头像净空、桌牌支撑及七状态动作仍见[质量回归记录](../../../../docs/quality-regressions.md)中的 OPEN 项。
