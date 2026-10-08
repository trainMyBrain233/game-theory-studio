#!/usr/bin/env python3
"""Prepare complete SC fonts; never subsets glyphs or renames a JP face as SC.
Default: extract/copy installed Noto CJK. --download opts into official downloads.
Requires Python 3 and fontTools (python -m pip install fonttools).
"""
from pathlib import Path
import argparse, hashlib, json, os, shutil, sys, urllib.request
try:
    from fontTools.ttLib import TTFont, TTCollection
except ImportError:
    raise SystemExit('Missing fontTools. Run: python -m pip install fonttools')
ROOT = Path(__file__).resolve().parent
BASE = 'https://raw.githubusercontent.com/notofonts/noto-cjk/main'

def names(font, name_id):
    return {n.toUnicode() for n in font['name'].names if n.nameID == name_id}

def verify(file, kind, weight):
    f = TTFont(str(file), lazy=True)
    wanted = f'Noto {kind} CJK SC'
    families = names(f, 1) | names(f, 16)
    if wanted not in families:
        raise ValueError(f'{file}: expected {wanted}, got {sorted(families)}')
    expected_weight = 400 if weight == 'Regular' else 700
    if f['OS/2'].usWeightClass != expected_weight:
        raise ValueError(f'{file}: wrong weight')
    cmap = f.getBestCmap()
    missing = [c for c in '博弈论入门参与者信息策略收益每种组合各得什么选择规则红蓝' if ord(c) not in cmap]
    if missing:
        raise ValueError(f'{file}: missing Chinese glyphs: {missing}')
    # Full Noto CJK sources contain far more glyphs; reject tiny specimen subsets.
    if len(f.getGlyphOrder()) < 20000:
        raise ValueError(f'{file}: appears to be a small subset, not a complete CJK font')
    result = {'family':wanted,'weight':expected_weight,'version':sorted(names(f, 5)),
              'glyph_count':len(f.getGlyphOrder()),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
    f.close()
    return result

def prepare(source, target, kind, weight):
    temp = target.with_suffix('.tmp.otf')
    face_index = None
    if source.suffix.lower() == '.ttc':
        collection = TTCollection(str(source), lazy=True)
        wanted = f'Noto {kind} CJK SC'
        matches = [(i,f) for i,f in enumerate(collection.fonts)
                   if wanted in (names(f,1) | names(f,16))
                   and f['OS/2'].usWeightClass == (400 if weight=='Regular' else 700)]
        if len(matches) != 1:
            collection.close()
            raise ValueError(f'{source}: expected exactly one {wanted} {weight} face, found {len(matches)}')
        face_index, face = matches[0]
        face.save(str(temp))  # Complete face; no subsetting.
        collection.close()
    else:
        shutil.copyfile(source, temp)
    result = verify(temp, kind, weight)
    os.replace(temp, target)
    result.update({'source':str(source),'face_index':face_index})
    return result

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source-dir',type=Path,action='append',default=[],help='Additional font folder; repeatable')
    p.add_argument('--output-dir',type=Path,default=ROOT/'typography/fonts')
    p.add_argument('--download',action='store_true',help='If local files are absent, download full SC fonts from official notofonts/noto-cjk')
    p.add_argument('--verify-only',action='store_true',help='Check already-prepared four SC fonts')
    a = p.parse_args(); a.output_dir.mkdir(parents=True,exist_ok=True)
    roots=a.source_dir+[Path('/usr/share/fonts'),Path('/usr/local/share/fonts'),Path.home()/'.local/share/fonts',Path.home()/'.fonts',Path('/Library/Fonts'),Path.home()/'Library/Fonts',Path(os.environ.get('WINDIR','C:/Windows'))/'Fonts']
    files={}
    for r in roots:
        if r.is_dir():
            for pattern in ['NotoSansCJK*.ttc','NotoSerifCJK*.ttc','NotoSansCJK*.otf','NotoSerifCJK*.otf']:
                for f in r.rglob(pattern):files.setdefault(f.name.lower(),f)
    report={}; missing=[]
    for kind in ['Sans','Serif']:
        for weight in ['Regular','Bold']:
            target=a.output_dir/f'Noto{kind}CJKSC-{weight}.otf'
            if target.exists():
                report[target.name]=verify(target,kind,weight); print('Verified',target.name); continue
            if a.verify_only:
                missing.append(target.name); continue
            candidates=[f'Noto{kind}CJK-{weight}.ttc',f'Noto{kind}CJKsc-{weight}.otf']
            source=next((files[n.lower()] for n in candidates if n.lower() in files),None)
            if source:
                report[target.name]=prepare(source,target,kind,weight)
                print('Prepared',target.name,'SC face',report[target.name]['face_index']); continue
            url=f'{BASE}/{kind}/OTF/SimplifiedChinese/Noto{kind}CJKsc-{weight}.otf'
            if a.download:
                temporary=a.output_dir/(target.name+'.download')
                try:
                    with urllib.request.urlopen(url,timeout=120) as response, temporary.open('wb') as output:
                        shutil.copyfileobj(response,output)
                    report[target.name]=prepare(temporary,target,kind,weight)
                    report[target.name]['source']=url
                    temporary.unlink(); print('Downloaded and verified',target.name)
                except Exception as e:
                    temporary.unlink(missing_ok=True); missing.append(f'{target.name}: {e}')
            else:missing.append(f'{target.name}\n  official: {url}')
    if missing:
        print('\nFonts are NOT ready. Missing/failed:\n'+'\n'.join(missing),file=sys.stderr)
        print('Use --source-dir /path/to/fonts or explicitly add --download. Do not render with fallback fonts.',file=sys.stderr)
        return 1
    (a.output_dir/'prepared_font_manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print('All four complete SC fonts are ready. Manifest saved.'); return 0
if __name__ == '__main__':
    try:sys.exit(main())
    except Exception as error:raise SystemExit(f'Font preparation failed: {error}')
