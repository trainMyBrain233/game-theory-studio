#!/usr/bin/env python3
"""Probe and fully decode a full episode or an explicitly sized preview."""
from pathlib import Path
import argparse
import hashlib
import json
import math
import shutil
import subprocess
import time
from media_contract import validate_streams

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('paths', nargs='*', type=Path)
parser.add_argument('--duration', type=float, help='Explicit expected preview duration; default is the canonical full episode.')
args = parser.parse_args()
timeline = json.loads((ROOT.parent / 'chapters/01-four-elements/narration/timeline.json').read_text(encoding='utf-8'))
duration = args.duration if args.duration is not None else timeline['duration']
if not math.isfinite(duration) or not 0 < duration <= timeline['duration']:
    parser.error('Expected duration must be positive and inside the episode.')
if not all(shutil.which(tool) for tool in ['ffmpeg', 'ffprobe']):
    parser.error('Install ffmpeg and ffprobe on PATH for encoded-media QA.')
for path in args.paths or [ROOT / 'output/game_theory_textbook_v2_clean_1920.mp4']:
    info = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)]))
    video, audio, count = validate_streams(info, duration)
    start = time.monotonic()
    run = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-progress', 'pipe:1', '-f', 'null', '-'], capture_output=True, text=True, encoding='utf-8')
    assert run.returncode == 0 and not run.stderr.strip(), run.stderr
    frames = [int(x.split('=')[1]) for x in run.stdout.splitlines() if x.startswith('frame=')]
    assert frames and frames[-1] == count
    report = {'file':path.name,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
              'expected_duration':duration, 'video':{k:video.get(k) for k in ['codec_name','profile','level','width','height','sample_aspect_ratio','pix_fmt','r_frame_rate','avg_frame_rate','start_time','duration','nb_frames','color_range','color_space','color_transfer','color_primaries']},
              'audio_tracks':len(audio), 'audio_codecs':[x['codec_name'] for x in audio],
              'audio':[{k:stream.get(k) for k in ['codec_name','sample_rate','channels','start_time','duration']} for stream in audio],
              'full_decode':{'status':'passed','frames':frames[-1],'elapsed_seconds':round(time.monotonic()-start,2)}}
    (ROOT / 'qa' / ('media_' + path.name + '.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'{path.name}: {count} frames fully decoded; {len(audio)} audio tracks; encoding contract passed.')
