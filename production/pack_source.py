#!/usr/bin/env python3
"""Create private complete or public renderer-only source archives."""
from pathlib import Path
import json,zipfile,hashlib,sys
ROOT=Path(__file__).resolve().parent
public='--public' in sys.argv
OUT=ROOT/('output/game_theory_studio_renderer_public.zip' if public else 'output/game_theory_studio_v2_source_private.zip')
exclude={'output','node_modules','.git','__pycache__'} | ({'private_characters'} if public else set())
files=[]
for p in ROOT.rglob('*'):
    rel=p.relative_to(ROOT)
    if not p.is_file() or p.is_symlink() or any(x in exclude for x in rel.parts):continue
    if rel.as_posix()=='private_characters/pvz/src/character.mjs':continue
    if p.suffix.lower() in {'.otf','.ttf','.ttc','.mp4','.wav','.zip','.log'}:continue
    if p.name.endswith('-log.txt') or p.name in {'SOURCE_MANIFEST.json','contact_sheet.png'}:continue
    files.append(p)
manifest={'distribution':'public_renderer_without_character_art' if public else 'private_complete_production_source','files':[{'path':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files],'font_binaries_included':False,'character_art_included':not public}
with zipfile.ZipFile(OUT,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for p in files:z.write(p,'game-theory-studio/'+str(p.relative_to(ROOT)))
    z.writestr('game-theory-studio/SOURCE_MANIFEST.json',json.dumps(manifest,ensure_ascii=False,indent=2))
with zipfile.ZipFile(OUT) as z:
    assert z.testzip() is None
    assert len(z.namelist())==len(set(z.namelist()))
    if public:assert not any('/private_characters/' in n for n in z.namelist())
assert OUT.stat().st_size<15*1024*1024
print(OUT,OUT.stat().st_size,'bytes; CRC and unique filenames verified; no font binaries.')
