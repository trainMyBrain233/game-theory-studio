#!/usr/bin/env python3
from pathlib import Path
from fontTools.ttLib import TTFont
import json,hashlib
ROOT=Path(__file__).resolve().parents[1]
qa=json.loads((ROOT/'qa/checks.json').read_text())
text=''.join(qa.get('text_inventory',[]))+'博弈论入门参与者信息策略收益每种组合各得什么红蓝小A小B普通僵尸路障铁桶报纸'
chars={ord(x) for x in text if not x.isspace()};out=[]
for weight,value in [('Regular',400),('Bold',700)]:
 p=ROOT/'typography/fonts'/f'NotoSansCJKSC-{weight}.otf';f=TTFont(p);names={n.toUnicode() for n in f['name'].names if n.nameID in [1,16]};assert 'Noto Sans CJK SC' in names;assert f['OS/2'].usWeightClass==value
 missing=[chr(c) for c in chars if c not in f.getBestCmap()];assert not missing,missing
 out.append({'file':p.name,'family':sorted(names),'weight':value,'cmap_covered_characters':len(chars),'missing':missing,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(ROOT/'qa/font_checks.json').write_text(json.dumps(out,ensure_ascii=False,indent=2));print(json.dumps(out,ensure_ascii=False,indent=2))
