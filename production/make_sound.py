#!/usr/bin/env python3
"""Original sparse, restrained UI/physical cues; no speech or borrowed audio."""
import json, math, wave
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parent
T=json.loads((ROOT.parent/'chapters/01-four-elements/narration/timeline.json').read_text(encoding='utf-8'))
SR=48000
out=np.zeros((round(T['duration']*SR),2),dtype=np.float64)
rng=np.random.default_rng(20261008)
events=[]
def cue(at,kind='tap',pan=0):
    n=round((.22 if kind=='tap' else .40)*SR); t=np.arange(n)/SR
    if kind=='tap':
        env=np.exp(-t*28)*(1-np.exp(-t*400)); sig=(np.sin(2*math.pi*480*t)+.30*np.sin(2*math.pi*960*t))*env*.048
    else:
        env=np.sin(np.pi*np.arange(n)/(n-1))**2;noise=rng.standard_normal(n);smooth=np.convolve(noise,np.ones(15)/15,mode='same');sig=smooth*env*.022
    a=round(at*SR);b=min(a+n,len(out));sig=sig[:b-a]
    out[a:b,0]+=sig*(1-pan*.22);out[a:b,1]+=sig*(1+pan*.22);events.append({'time':at,'kind':kind,'pan':pan})
for at in [0.7,11.55,31.15,56.45,75.3,87.1,98.4,155.9]:cue(at,'paper')
for at in [6.9,35.0,37.6,43.05,59.5,61.4,78.65,80.45,81.6,99.8,103.05,106.25,158.95,160.3,162.6,164.0]:cue(at)
for s in T['segments']:
    if s['visual_cue']['action']=='reveal_scores':
        seen=set()
        for r in s['visual_cue']['score_reveals']:
            at=s['start']+r['offset']
            if at not in seen:cue(at,'tap',-.12 if r['player']=='A' else .12);seen.add(at)
peak=float(np.max(np.abs(out)));pcm=(np.clip(out,-1,1)*32767).astype('<i2')
(ROOT/'output').mkdir(exist_ok=True)
with wave.open(str(ROOT/'output/original_sparse_sfx.wav'),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes(pcm.tobytes())
(ROOT/'qa/sound_manifest.json').write_text(json.dumps({'source':'original synthesis in make_sound.py','speech':False,'music':False,'sample_rate':SR,'channels':2,'duration':T['duration'],'peak_dbfs':20*math.log10(peak),'events':events},indent=2),encoding='utf-8')
print(f'Original SFX complete, peak={20*math.log10(peak):.2f} dBFS, {len(events)} sparse cues.')
