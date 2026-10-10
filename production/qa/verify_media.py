#!/usr/bin/env python3
"""Probe and fully decode a full episode or an explicitly sized preview."""
from pathlib import Path
import argparse
from contextlib import contextmanager
import hashlib
import json
import math
import os
import shutil
import subprocess
import tempfile
import time
import unicodedata
from media_contract import validate_faststart, validate_streams

ROOT = Path(__file__).resolve().parents[1]


def sha256_file(path):
    """Hash encoded media with bounded memory, regardless of episode size."""
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


@contextmanager
def media_snapshot(path):
    """Freeze input bytes on disk; never reopen the caller's mutable pathname.

    A private copy also isolates in-place writes during QA, unlike an open input
    descriptor. Copying and hashing use bounded memory even for full episodes.
    Every check and report field refers to this one copy, not later replacements
    of the source. The temporary directory is removed on success or failure.
    """
    with tempfile.TemporaryDirectory(prefix='media-qa-') as directory:
        snapshot = Path(directory) / 'input.mp4'
        def identity(stat):
            return (stat.st_dev, stat.st_ino, stat.st_size,
                    stat.st_mtime_ns, stat.st_ctime_ns)

        with path.open('rb') as source, snapshot.open('wb') as target:
            original = identity(os.fstat(source.fileno()))
            shutil.copyfileobj(source, target, length=1024 * 1024)
            if identity(os.fstat(source.fileno())) != original:
                raise RuntimeError('Media input changed during snapshot; rerun QA')
        yield snapshot
        # Fail closed on observed replacement/modification. The proof still
        # refers only to snapshot bytes, even if a writer races this final check.
        try:
            current = identity(path.stat())
        except FileNotFoundError as cause:
            raise RuntimeError('Media input changed during QA; rerun QA') from cause
        if current != original:
            raise RuntimeError('Media input changed during QA; rerun QA')


def main(argv=None, root=ROOT):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('paths', nargs='*', type=Path)
    parser.add_argument('--duration', type=float, help='Explicit expected preview duration; default is the canonical full episode.')
    parser.add_argument('--width', type=int, choices=[1920, 3840], help='Expected width for custom files. Canonical episode/preview filenames always require their named resolution; otherwise either supported resolution is accepted.')
    args = parser.parse_args(argv)
    paths = args.paths or [root / 'output/game_theory_textbook_v2_clean_1920.mp4']
    # Report names are a public interface. Reject all collisions before probing
    # or publishing any file, rather than silently replacing another input's QA.
    reports = set()
    expected_widths = []
    canonical_widths = {f'{prefix}_{width}.mp4': width
                        for prefix in ('game_theory_textbook_v2_clean', 'transition_preview')
                        for width in (1920, 3840)}
    for path in paths:
        report_name = 'media_' + path.name + '.json'
        # Keep the same preflight safe on case-insensitive and Unicode-normalizing
        # filesystems used for delivery review, even when running on Linux.
        report_identity = unicodedata.normalize('NFC', report_name).casefold()
        if report_identity in reports:
            parser.error(f'Duplicate media report identity: {report_name}; use distinct input basenames.')
        reports.add(report_identity)
        canonical_width = canonical_widths.get(path.name)
        if canonical_width is not None and args.width is not None and args.width != canonical_width:
            parser.error(f'--width {args.width} conflicts with canonical artifact {path.name}.')
        expected_widths.append(canonical_width if canonical_width is not None else args.width)
    timeline = json.loads((root.parent / 'chapters/01-four-elements/narration/timeline.json').read_text(encoding='utf-8'))
    tokens = json.loads((root / 'tokens.json').read_text(encoding='utf-8'))
    faststart = tokens['encoding']['faststart']
    if not isinstance(faststart, bool):
        raise ValueError('Expected boolean encoding.faststart')
    duration = args.duration if args.duration is not None else timeline['duration']
    if not math.isfinite(duration) or not 0 < duration <= timeline['duration']:
        parser.error('Expected duration must be positive and inside the episode.')
    if not all(shutil.which(tool) for tool in ['ffmpeg', 'ffprobe']):
        parser.error('Install ffmpeg and ffprobe on PATH for encoded-media QA.')
    for path, expected_width in zip(paths, expected_widths):
        with media_snapshot(path) as snapshot:
            info = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(snapshot)]))
            video, audio, count = validate_streams(info, duration, expected_width=expected_width)
            layout = validate_faststart(snapshot) if faststart else None
            start = time.monotonic()
            run = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(snapshot), '-progress', 'pipe:1', '-f', 'null', '-'], capture_output=True, text=True, encoding='utf-8')
            if run.returncode != 0 or run.stderr.strip():
                raise RuntimeError(f'Full decode failed (exit {run.returncode}): {run.stderr.strip()}')
            frames = [int(x.split('=')[1]) for x in run.stdout.splitlines() if x.startswith('frame=')]
            if not frames or frames[-1] != count:
                raise RuntimeError(f'Decoded frame count mismatch: expected {count}, got {frames[-1] if frames else None}')
            report = {'file':path.name,'bytes':snapshot.stat().st_size,'sha256':sha256_file(snapshot),
                      'expected_duration':duration, 'expected_width':expected_width, 'faststart':{'required':faststart, 'layout':layout}, 'video':{k:video.get(k) for k in ['codec_name','profile','level','width','height','sample_aspect_ratio','pix_fmt','r_frame_rate','avg_frame_rate','start_time','duration','nb_frames','color_range','color_space','color_transfer','color_primaries']},
                      'audio_tracks':len(audio), 'audio_codecs':[x['codec_name'] for x in audio],
                      'audio':[{k:stream.get(k) for k in ['codec_name','sample_rate','channels','start_time','duration']} for stream in audio],
                      'full_decode':{'status':'passed','frames':frames[-1],'elapsed_seconds':round(time.monotonic()-start,2)}}
        (root / 'qa' / ('media_' + path.name + '.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(f'{path.name}: {count} frames fully decoded; {len(audio)} audio tracks; encoding contract passed.')


if __name__ == '__main__':
    main()
