#!/usr/bin/env python3
"""Original sparse, restrained UI/physical cues; no speech or borrowed audio."""
from dataclasses import asdict
import json
import math
from pathlib import Path
import wave

import numpy as np

from sound_plan import plan_cues

ROOT = Path(__file__).resolve().parent
SR = 48000


def synthesize(timeline):
    # Validate the entire semantic plan before allocating audio or touching outputs.
    plan = plan_cues(timeline)
    out = np.zeros((round(timeline['duration'] * SR), 2), dtype=np.float64)
    rng = np.random.default_rng(20261008)
    for event in plan:
        n = round((.22 if event.kind == 'tap' else .40) * SR)
        t = np.arange(n) / SR
        if event.kind == 'tap':
            env = np.exp(-t * 28) * (1 - np.exp(-t * 400))
            sig = (np.sin(2 * math.pi * 480 * t) + .30 * np.sin(2 * math.pi * 960 * t)) * env * .048
        else:
            env = np.sin(np.pi * np.arange(n) / (n - 1)) ** 2
            noise = rng.standard_normal(n)
            smooth = np.convolve(noise, np.ones(15) / 15, mode='same')
            sig = smooth * env * .022
        a = round(event.time * SR)
        b = min(a + n, len(out))
        sig = sig[:b - a]
        out[a:b, 0] += sig * (1 - event.pan * .22)
        out[a:b, 1] += sig * (1 + event.pan * .22)
    return out, plan


def main():
    timeline = json.loads((ROOT.parent / 'chapters/01-four-elements/narration/timeline.json').read_text(encoding='utf-8'))
    out, plan = synthesize(timeline)
    peak = float(np.max(np.abs(out)))
    pcm = (np.clip(out, -1, 1) * 32767).astype('<i2')
    (ROOT / 'output').mkdir(exist_ok=True)
    with wave.open(str(ROOT / 'output/original_sparse_sfx.wav'), 'wb') as audio:
        audio.setnchannels(2)
        audio.setsampwidth(2)
        audio.setframerate(SR)
        audio.writeframes(pcm.tobytes())
    (ROOT / 'qa/sound_manifest.json').write_text(json.dumps({
        'source': 'original synthesis in make_sound.py',
        'timing_contract': 'semantic-segment-offset:1',
        'alignment': 'manual-reference',
        'speech': False,
        'music': False,
        'sample_rate': SR,
        'channels': 2,
        'duration': timeline['duration'],
        'peak_dbfs': 20 * math.log10(peak),
        'events': [asdict(event) for event in plan],
    }, indent=2), encoding='utf-8')
    print(f'Original SFX complete, peak={20 * math.log10(peak):.2f} dBFS, {len(plan)} sparse cues.')


if __name__ == '__main__':
    main()
