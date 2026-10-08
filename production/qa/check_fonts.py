#!/usr/bin/env python3
from pathlib import Path
from fontTools.ttLib import TTFont
import json,hashlib,sys
sys.stdout.reconfigure(encoding="utf-8")
ROOT=Path(__file__).resolve().parents[1]
qa=json.loads((ROOT/'qa/checks.json').read_text(encoding='utf-8'))
text=''.join(qa.get('text_inventory',[]))+'博弈论入门参与者信息策略收益每种组合各得什么红蓝小A小B'
manifest=json.loads((ROOT.parent/'typography/fonts/prepared_font_manifest.json').read_text(encoding='utf-8'))
chars={ord(x) for x in text if not x.isspace()};out=[]
for kind,weight,value in [('Sans','Regular',400),('Sans','Bold',700),('Serif','Regular',400),('Serif','Bold',700)]:
 p=ROOT.parent/'typography/fonts'/f'Noto{kind}CJKSC-{weight}.otf';f=TTFont(p);names={n.toUnicode() for n in f['name'].names if n.nameID in [1,16]};assert f'Noto {kind} CJK SC' in names;assert f['OS/2'].usWeightClass==value
 assert hashlib.sha256(p.read_bytes()).hexdigest()==manifest[p.name]['sha256']
 missing=[chr(c) for c in chars if c not in f.getBestCmap()];assert not missing,missing
 out.append({'file':p.name,'family':sorted(names),'weight':value,'cmap_covered_characters':len(chars),'missing':missing,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(ROOT/'qa/font_checks.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(out,ensure_ascii=False,indent=2))
