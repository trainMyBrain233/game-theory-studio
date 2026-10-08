#!/usr/bin/env python3
"""Prepare complete SC fonts; never subsets glyphs or renames a JP face as SC.
Default: extract/copy installed Noto CJK. --download opts into official downloads.
Requires Python 3 and fontTools (python -m pip install fonttools).
"""
from pathlib import Path
import argparse, hashlib, json, os, shutil, sys, tempfile, urllib.request
try:
    from fontTools.ttLib import TTFont, TTCollection
except ImportError:
    raise SystemExit('Missing fontTools. Run: python -m pip install fonttools')
ROOT = Path(__file__).resolve().parent.parent
BASE = 'https://raw.githubusercontent.com/notofonts/noto-cjk'
RELEASES = {'Sans': 'Sans2.004', 'Serif': 'Serif2.003'}
COMMITS = {'Sans': '523d033d6cb47f4a80c58a35753646f5c3608a78', 'Serif': '9b0f1436e455d902de067a2501422e5dc71ad16b'}
OFFICIAL_SHA256 = {
    ('Sans','Regular'): '2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b',
    ('Sans','Bold'): 'b5f0d1a190a7f9b43c310a8850630af12553df32c4c050543f9059732d9b4c0a',
    ('Serif','Regular'): '2a2eae2628df83556c54018c41e20fa532c1b862c5256ae8b3f23feb918d12ca',
    ('Serif','Bold'): '8af07d4b6c2e82bcc72a30e066eaf295f11b9424f4aad2eaa9fe0e9c3b38fc73',
}
EXPECTED_VERSIONS = {'Sans': '2.004', 'Serif': '2.003'}

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
    versions = sorted(names(f, 5))
    if not any(v.startswith(f'Version {EXPECTED_VERSIONS[kind]};') for v in versions):
        raise ValueError(f'{file}: expected Noto {kind} version {EXPECTED_VERSIONS[kind]}, got {versions}')
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
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
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
        face.recalcTimestamp = False
        face.save(str(temp))  # Complete face; no subsetting; preserve source timestamp.
        collection.close()
    else:
        if source_hash != OFFICIAL_SHA256[(kind, weight)]:
            raise ValueError('Individual SC OTF must match the pinned official checksum; unknown OTF is not accepted')
        shutil.copyfile(source, temp)
    try:
        result = verify(temp, kind, weight)
        if hashlib.sha256(source.read_bytes()).hexdigest() != source_hash:
            raise ValueError('Font source changed during preparation')
        os.replace(temp, target)
    finally:
        temp.unlink(missing_ok=True)
    result.update({'source':str(source),'face_index':face_index,'source_sha256':source_hash,
                   'source_kind':'local_ttc_extraction' if face_index is not None else 'official_pinned_otf'})
    return result

def verify_cached(target, kind, weight, previous):
    actual = hashlib.sha256(target.read_bytes()).hexdigest()
    pinned = OFFICIAL_SHA256[(kind, weight)]
    if actual == pinned:
        result = verify(target, kind, weight)
        result.update({'source_kind':'official_pinned_otf','source_sha256':pinned,'face_index':None,
                       'source':f'{BASE}/{COMMITS[kind]}/{kind}/OTF/SimplifiedChinese/Noto{kind}CJKsc-{weight}.otf'})
        return result
    if previous.get('source_kind') != 'local_ttc_extraction':
        raise ValueError('Prepared OTF checksum differs from the pinned official file; unknown modifications cannot be re-certified')
    source = Path(previous.get('source', ''))
    if source.suffix.lower() != '.ttc' or not source.is_file():
        raise ValueError('Original TTC source is required to verify a locally extracted face')
    if actual != previous.get('sha256') or hashlib.sha256(source.read_bytes()).hexdigest() != previous.get('source_sha256'):
        raise ValueError('Local TTC source or prepared checksum changed; run explicit preparation after reviewing the source')
    # A manifest's self-reported target hash is insufficient: independently re-extract the source.
    with tempfile.TemporaryDirectory(prefix='noto-sc-verify-') as temporary:
        derived = prepare(source, Path(temporary)/target.name, kind, weight)
    if actual != derived['sha256'] or previous.get('face_index') != derived['face_index']:
        raise ValueError('Prepared font does not match the complete SC face re-extracted from its recorded TTC source')
    return derived

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source-dir',type=Path,action='append',default=[],help='Additional font folder; repeatable')
    p.add_argument('--output-dir',type=Path,default=ROOT/'typography/fonts')
    p.add_argument('--download',action='store_true',help='Prefer pinned official SC downloads for missing/invalid targets; ignore installed font candidates')
    p.add_argument('--verify-only',action='store_true',help='Check already-prepared four SC fonts')
    a = p.parse_args(); a.output_dir.mkdir(parents=True,exist_ok=True)
    if a.verify_only and a.download:
        p.error('--verify-only cannot be combined with --download')
    roots=a.source_dir+[Path('/usr/share/fonts'),Path('/usr/local/share/fonts'),Path.home()/'.local/share/fonts',Path.home()/'.fonts',Path('/Library/Fonts'),Path.home()/'Library/Fonts',Path(os.environ.get('WINDIR','C:/Windows'))/'Fonts']
    files={}
    for r in roots:
        if r.is_dir():
            for pattern in ['NotoSansCJK*.ttc','NotoSerifCJK*.ttc','NotoSansCJK*.otf','NotoSerifCJK*.otf']:
                for f in r.rglob(pattern):files.setdefault(f.name.lower(),f)
    manifest_path = a.output_dir/'prepared_font_manifest.json'
    previous = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {}
    report={}; missing=[]
    for kind in ['Sans','Serif']:
        for weight in ['Regular','Bold']:
            target=a.output_dir/f'Noto{kind}CJKSC-{weight}.otf'
            if target.exists():
                try:
                    verified = verify_cached(target,kind,weight,previous.get(target.name,{}))
                except Exception as error:
                    if not a.download and (a.verify_only or not a.source_dir):
                        missing.append(f'{target.name}: {error}'); continue
                    print('Invalid prepared target; will replace only after verified source preparation:',target.name)
                else:
                    if a.verify_only and previous.get(target.name,{}).get('sha256') != verified['sha256']:
                        missing.append(f'{target.name}: manifest does not match independently verified font bytes'); continue
                    report[target.name] = verified
                    print('Verified',target.name); continue
            if a.verify_only:
                missing.append(target.name); continue
            candidates=[f'Noto{kind}CJK-{weight}.ttc',f'Noto{kind}CJKsc-{weight}.otf']
            source=next((files[n.lower()] for n in candidates if n.lower() in files),None)
            if source and not a.download:
                report[target.name]=prepare(source,target,kind,weight)
                print('Prepared',target.name,'SC face',report[target.name]['face_index']); continue
            url=f'{BASE}/{COMMITS[kind]}/{kind}/OTF/SimplifiedChinese/Noto{kind}CJKsc-{weight}.otf'
            if a.download:
                temporary=a.output_dir/(target.name+'.download')
                try:
                    with urllib.request.urlopen(url,timeout=120) as response, temporary.open('wb') as output:
                        shutil.copyfileobj(response,output)
                    if hashlib.sha256(temporary.read_bytes()).hexdigest() != OFFICIAL_SHA256[(kind,weight)]:
                        raise ValueError('Official font checksum mismatch; existing target is preserved')
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
    if a.verify_only:
        if not manifest_path.exists():
            print('Prepared manifest is missing; run setup:fonts to record provenance before QA.',file=sys.stderr)
            return 1
        print('All four complete SC fonts verified against pinned OTFs or reproduced TTC sources; manifest unchanged.')
        return 0
    temporary_manifest=manifest_path.with_suffix('.tmp.json')
    temporary_manifest.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    os.replace(temporary_manifest,manifest_path)
    print('All four complete SC fonts are ready. Manifest saved.'); return 0
if __name__ == '__main__':
    try:sys.exit(main())
    except Exception as error:raise SystemExit(f'Font preparation failed: {error}')
