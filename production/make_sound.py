#!/usr/bin/env python3
"""Original sparse, restrained UI/physical cues; no speech or borrowed audio."""
from dataclasses import asdict
import hashlib
import io
import json
import math
from pathlib import Path
import sys
import wave

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from narration_io import write_products

from sound_plan import plan_cues

ROOT = Path(__file__).resolve().parent
SR = 48000


def synthesize(timeline):
    import numpy as np

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


def publish_sound(directory, pcm_bytes, manifest, *, before_publish=None):
    """Stage both products, rolling back ordinary publication failures.

    The shared publisher excludes symlinks and special files. This is not an
    atomic multi-file snapshot or crash-durable; callers exclude concurrent writers.
    """
    wav = io.BytesIO()
    with wave.open(wav, 'wb') as audio:
        audio.setnchannels(2)
        audio.setsampwidth(2)
        audio.setframerate(SR)
        audio.writeframes(pcm_bytes)
    write_products(directory, {
        'output/original_sparse_sfx.wav': wav.getvalue(),
        'qa/sound_manifest.json': json.dumps(manifest, indent=2),
    }, before_publish=before_publish)


def main():
    import numpy as np

    timeline_path = ROOT.parent / 'chapters/01-four-elements/narration/timeline.json'
    timeline_bytes = timeline_path.read_bytes()
    timeline_sha256 = hashlib.sha256(timeline_bytes).hexdigest()
    timeline = json.loads(timeline_bytes.decode('utf-8'))

    def verify_timeline():
        try:
            unchanged = timeline_path.read_bytes() == timeline_bytes
        except OSError as error:
            raise RuntimeError('Timeline changed during SFX build; rebuild sound.') from error
        if not unchanged:
            raise RuntimeError('Timeline changed during SFX build; rebuild sound.')

    out, plan = synthesize(timeline)
    peak = float(np.max(np.abs(out)))
    pcm = (np.clip(out, -1, 1) * 32767).astype('<i2')
    verify_timeline()
    publish_sound(ROOT, pcm.tobytes(), {
        'source': 'original synthesis in make_sound.py',
        'timing_contract': 'semantic-segment-offset:1',
        'alignment': 'manual-reference',
        # Exact canonical input identity is separate from speech alignment.
        'timeline_sha256': timeline_sha256,
        'speech': False,
        'music': False,
        'sample_rate': SR,
        'channels': 2,
        'duration': timeline['duration'],
        'peak_dbfs': 20 * math.log10(peak),
        'events': [asdict(event) for event in plan],
    }, before_publish=verify_timeline)
    print(f'Original SFX complete, peak={20 * math.log10(peak):.2f} dBFS, {len(plan)} sparse cues.')


if __name__ == '__main__':
    main()
