# 可复用绘制接口

这些模块已由第一章主片消费，保持原布局与旧命令。导入纯计算/元素模块不读取内容、字体或资产，也不创建Canvas；资源初始化仍由现有入口负责。它们不是任意章节引擎。

| 接口 | 显式输入与实际消费 | 可检查元数据/限制 |
| --- | --- | --- |
| `motion.mjs` | 时间、进度、进入/退出配置；primitives、章节标题/定义、手牌动作、rig和adapter | transform/textTransition状态；章节标题按进入位移，定义按总可见度位移；保留历史浮点求值顺序 |
| `elements/card.mjs` | `createCardElement({assets,palette,strategies,drawing,labelContract})`；draw接收kind/x/y/width/angle/flip/alpha/label；各节通过旧card/cardFlip调用同一实例 | 原140×190比例；实际消费asset-hotspots中(70,130)、44源单位、700、center/middle，按牌宽同比缩放；105px牌的标签为33px，小型重复图标需邻近可读说明；原创路径SVG加载后为按目标尺寸栅格化的Canvas资源 |
| `card-transform.mjs` | 同一transform供卡牌绘制与手部attachment；场景从choreography读取角度 | grip位于内侧上角x=side×.4×width；y=-52×width/105；含旋转，物理握点不随翻面cos横跳 |
| `elements/payoff-matrix.mjs` | `createPayoffMatrixElement({timeline,summaryStart,drawing})`；收益和复盘两节共用draw/currentCell | A行/B列、A/B数对顺序、字号/偏移/揭示时长；当前两个策略和四格；活动行列指示线仍在第一章固定净空坐标，任意布局未支持 |
| `elements/subtitle.mjs` | `createSubtitleElement({timeline,tokens,drawing})`；主片最后绘制整块字幕 | 1920×1080坐标、单双行基线、实际字号/700、0.09s淡入、持留到segment.end；不逐字动画 |
| `character-layers.mjs` | prepared空间pivot、骨长、共享IDLE_HAND=[250,190]、layerContract/characterManifest；实际loader、rig绘制消费 | 每角色head/torso/upper/forearm四层；眼嘴烘焙在head，腕手指烘焙在forearm；无独立眼嘴腿/第二只活动手 |

绘制依赖由宿主注入（tx/line/round/group/reveal等），保持字体断言、测量记录和Canvas调用顺序。元素不复制另一套模型常量。矩阵metadata声明几何限制，不能仅改变配置就宣称任意布局支持。

## 角色坐标与诊断

stored是原PNG像素；prepared是prepare_flip_x后的像素；rig的pivot全部指prepared。A torso与B非torso层预翻；world再按torso锚点、统一scale和side变换，二者不能合并或重复抵消。upper按270px高裁切，其余使用源高。

`prepareCharacterAssets()`读取外部八层后返回manifest，记录实际源/准备后尺寸、源字节数/SHA256、crop、pivot、parent、预处理镜像、真实capabilities与私有分发状态。`character_adapter.getAssetManifest()`供受控生产报告读取；默认不向公开仓库写清单或PNG。测试传入临时目录的八张原创几何RGBA验证实际加载/镜像，未使用第三方图像。

`actorPose(id,{x,y,scale,t})`无需打开PNG即可提供shoulder/elbow/requestedHand/solvedHand/handClamped及world坐标。contactError是IK求解点到请求点的几何距离；attachmentError另记录求解手点到卡牌握点的距离，在握紧窗口才应近零。松手过渡允许远离attachment。1080暂定接触误差≤2px，仍须实际角色像素验证，几何报告不证明手指没有遮挡。

1920主角色rig scale为.6，4K为1.2；文字/矩阵在目标画布重新绘制，角色仍受源RGBA细节限制，不宣称原生4K人物。

## 复用证据

`npm run qa:motion`以两个原创文字场景检查62帧的入场、停留、离场、相邻帧与乱序请求。矩阵在收益/复盘两节实际复用；卡牌跨六节复用；字幕用同一接口覆盖37块。接口测试使用注入记录与原创RGBA验证角色准备，不用私有素材。

同环境完整530个1080p占位帧对代码冻结提交836c551逐像素相同（包括卡牌、矩阵、字幕、章节标题/定义抽取）。836c551包含批准的持牌与s33变化，因此不把这项相同结论套到旧a20画面。实际私有角色影片仍须绑定新提交独立验收。

## 实际净空与回位验收

`tx`将当前配置中的独立姓名记录为actor-name。`--actor-alpha`按`TOKENS.spacing.figure_name_gap`检验姓名（32px），其余文字按`graphic_text_gap_target`（24px）；连接线仍用8px合同。检测透明像素及到文字测量框的欧氏距离，报告实际最近距离，9–31px姓名负例必须失败。

闲置手与信息章节退手共用`IDLE_HAND`，在prepared rig像素[250,190]回到胸前；不更改骨长/pivot/抓牌点，退手向上离开识别区。单元检查覆盖四种选择从开场到信息章节末的每个30fps帧、空闲腕点到符号中心至少65px、握牌目标不变与向上退手。腕点几何合同不等于整只位图手的净空；真实RGBA需要逐帧alpha/符号内核检验及裁图审阅。

## 逐层方向合同

`characterManifest` 1.1记录每层storedFacing、preparedFacing、sceneSide与worldFacing。先把每个原始图层归一至朝右，再在场景中令A取+1朝右、B取−1朝左。源图方向不能按角色身份一概假定：A躯干原本朝左，要预翻；B躯干原本朝右，不预翻。A其它层保持，B其它层预翻。对应规则为`part === 'torso' ? id === 'a' : id === 'b'`；原PNG像素不改，骨长、头/颈/肩及手臂pivot不改。

回归使用临时原创不对称箭头，检验实际loader的prepared像素、场景镜像和实际head/body绘制；旧B躯干的额外预翻会破坏朝右的canonical像素。真实图层仍须另查整体朝向、领口/肩袖接缝与动作中间帧。
