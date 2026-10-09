#!/usr/bin/env python3
"""Build boards from the exact current still set; never guess timeline seconds."""
import base64
import hashlib
import io
import json
import os
import struct
import subprocess
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'output'
TIMELINE = ROOT.parent / 'chapters/01-four-elements/narration/timeline.json'
FONT = ROOT.parent / 'typography/fonts/NotoSansCJKSC-Regular.otf'
MANIFEST = 'stills-manifest.json'


def load_checkpoints(output=OUT, timeline_path=TIMELINE):
    """Read-only contract validation, usable without Pillow or font loading."""
    output, timeline_path = Path(output), Path(timeline_path)
    file = output / MANIFEST
    if not file.is_file():
        raise ValueError('Missing stills-manifest.json; render episode stills first.')
    manifest = json.loads(file.read_text(encoding='utf-8'))
    timeline_bytes = timeline_path.read_bytes()
    # Reuse the producer's complete schedule/label/filename rules, including JS
    # rounding. Python must not recreate its own default or custom schedule.
    verification = subprocess.run(
        [os.environ.get('NODE', 'node'), str(ROOT / 'src/checkpoints.mjs'), '--verify-manifest'],
        input=json.dumps({'manifest': manifest, 'timeline_base64': base64.b64encode(timeline_bytes).decode('ascii')}),
        capture_output=True, text=True)
    if verification.returncode:
        raise ValueError(verification.stderr.strip() or 'Still checkpoint metadata verification failed.')
    groups = {}
    for point in manifest['checkpoints']:
        read_frame_bytes(output, point, (manifest['width'], manifest['height']), checkpoint_metadata(manifest, point))
        groups.setdefault(point['group'], []).append(point)
    return manifest, groups


def checkpoint_metadata(manifest, point):
    return {'timeline_sha256': manifest['timeline']['sha256'], 'mode': manifest['mode'],
            'checkpoint': {key: value for key, value in point.items() if key != 'sha256'}}


def read_frame_bytes(output, point, expected_size, expected_metadata=None):
    """Confine every image read and bind it to the verified manifest digest."""
    root = Path(output).resolve(strict=True)
    filename = point['file']
    if not isinstance(filename, str) or Path(filename).is_absolute() or Path(filename).name != filename or '/' in filename or '\\' in filename:
        raise ValueError('Still frame path must be a PNG basename inside the output directory.')
    try:
        image = (root / filename).resolve(strict=True)
    except FileNotFoundError:
        raise ValueError(f'Missing or changed still frame {filename}; render episode stills again.') from None
    if not image.is_relative_to(root):
        raise ValueError(f'Still frame symlink escapes the output directory: {filename}')
    if not image.is_file():
        raise ValueError(f'Missing or changed still frame {filename}; render episode stills again.')
    data = image.read_bytes()
    if point['sha256'] != hashlib.sha256(data).hexdigest():
        raise ValueError(f'Missing or changed still frame {filename}; render episode stills again.')
    # The full decoder remains Pillow's job when drawing a board. Check the PNG
    # envelope, all chunk CRCs and actual IHDR dimensions before accepting a set.
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError(f'Still frame is not a PNG: {filename}')
    offset, kinds, size, identities = 8, [], None, []
    while offset + 12 <= len(data):
        length = struct.unpack('>I', data[offset:offset + 4])[0]
        end = offset + 12 + length
        if end > len(data):
            raise ValueError(f'Truncated PNG: {filename}')
        kind, payload = data[offset + 4:offset + 8], data[offset + 8:end - 4]
        crc = struct.unpack('>I', data[end - 4:end])[0]
        if zlib.crc32(kind + payload) != crc:
            raise ValueError(f'Invalid PNG chunk checksum: {filename}')
        if kind == b'IHDR':
            if kinds or length != 13:
                raise ValueError(f'Invalid PNG header: {filename}')
            size = struct.unpack('>II', payload[:8])
        if kind == b'tEXt' and payload.startswith(b'StudioCheckpoint\0'):
            identities.append(json.loads(payload.split(b'\0', 1)[1].decode('ascii')))
        kinds.append(kind)
        offset = end
        if kind == b'IEND':
            if length != 0:
                raise ValueError(f'PNG IEND must be empty: {filename}')
            break
    if not kinds or kinds[0] != b'IHDR' or kinds[-1] != b'IEND' or b'IDAT' not in kinds or offset != len(data) or size != expected_size:
        raise ValueError(f'Invalid PNG structure or dimensions: {filename}')
    if expected_metadata is not None and identities != [expected_metadata]:
        raise ValueError(f'PNG checkpoint metadata differs from its manifest: {filename}')
    return data


def wrap_label(draw, text, font, max_width):
    lines, line = [], ''
    for char in text:
        candidate = line + char
        if line and draw.textlength(candidate, font=font) > max_width:
            lines.append(line)
            line = char
        else:
            line = candidate
    return lines + ([line] if line else [])


def main():
    manifest, groups = load_checkpoints()
    # Validate source/image provenance before loading fonts or drawing anything.
    from PIL import Image, ImageDraw, ImageFont
    font = ImageFont.truetype(str(FONT), 30)
    titlefont = ImageFont.truetype(str(FONT), 38)
    titles = {'keyframes': '关键帧', 'transitions': '转场中间帧', 'custom': '自选时间帧'}
    for group, items in groups.items():
        cols, tw, th = 4, 960, 540
        measure = ImageDraw.Draw(Image.new('RGB', (1, 1)))
        labels = [wrap_label(measure, f"{point['time_label']}  {point['label']}", font, tw - 44) for point in items]
        rh = th + 16 + 40 * max(map(len, labels))
        rows = (len(items) + cols - 1) // cols
        sheet = Image.new('RGB', (tw * cols, rows * rh + 90), '#FFFEF8')
        draw = ImageDraw.Draw(sheet)
        draw.text((32, 18), f"{titles[group]} · 原生{manifest['width']}×{manifest['height']}画面缩览", (36, 62, 102), font=titlefont)
        for i, point in enumerate(items):
            with Image.open(io.BytesIO(read_frame_bytes(OUT, point, (manifest['width'], manifest['height']), checkpoint_metadata(manifest, point)))) as source:
                if source.size != (manifest['width'], manifest['height']):
                    raise ValueError(f"Still frame dimensions differ from manifest: {point['file']}")
                image = source.convert('RGB').resize((tw, th), Image.Resampling.LANCZOS)
            x, y = (i % cols) * tw, 90 + (i // cols) * rh
            sheet.paste(image, (x, y))
            for row, text in enumerate(labels[i]):
                draw.text((x + 22, y + th + 4 + row * 40), text, (36, 62, 102), font=font)
        file = OUT / f'{group}_contact_sheet.png'
        sheet.save(file, optimize=True)
        print(file)


if __name__ == '__main__':
    main()
