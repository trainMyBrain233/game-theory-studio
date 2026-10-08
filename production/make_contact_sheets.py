#!/usr/bin/env python3
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parent;OUT=ROOT/'output'
FONT=ROOT.parent/'typography/fonts/NotoSansCJKSC-Regular.otf'
font=ImageFont.truetype(str(FONT),30);titlefont=ImageFont.truetype(str(FONT),38)
groups={
 'keyframes':[(3,'开场'),(8.3,'四问'),(27,'参与者'),(38.2,'信息遮挡'),(48.5,'规则与行动'),(68,'单次纯策略'),(83,'跨轮计划'),(108.5,'读表顺序'),(117.9,'红红'),(126.3,'红蓝'),(142.8,'蓝蓝'),(172,'复盘')],
 'transitions':[(30.95,'标题退入'),(56.4,'选择集合展开'),(75.3,'情境转换'),(75.7,'保留同一角色'),(87.3,'回到一轮'),(98.6,'角色身份移动'),(99.7,'矩阵成形'),(156.65,'同一矩阵收排')]
}
for group,items in groups.items():
    cols=4;tw,th=960,540;rh=588;rows=(len(items)+cols-1)//cols
    sheet=Image.new('RGB',(tw*cols,rows*rh+90),'#FFFEF8');d=ImageDraw.Draw(sheet)
    d.text((32,18),('关键帧' if group=='keyframes' else '转场中间帧')+' · 原生1080p画面缩览',(36,62,102),font=titlefont)
    for i,(t,label) in enumerate(items):
        file=OUT/f'frame_{t:.2f}_1920.png';img=Image.open(file).convert('RGB').resize((tw,th),Image.Resampling.LANCZOS);x=(i%cols)*tw;y=90+(i//cols)*rh;sheet.paste(img,(x,y));d.text((x+22,y+th+4),f'{t:.2f}s  {label}',(36,62,102),font=font)
    file=OUT/f'{group}_contact_sheet.png';sheet.save(file,optimize=True);print(file)
