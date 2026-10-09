#!/usr/bin/env python3
"""Build boards from the exact current still set; never guess timeline seconds."""
import base64
import hashlib
import io
import json
import os
import struct
import subprocess
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'output'
TIMELINE = ROOT.parent / 'chapters/01-four-elements/narration/timeline.json'
FONT = ROOT.parent / 'typography/fonts/NotoSansCJKSC-Regular.otf'
MANIFEST = 'stills-manifest.json'
# Sheets are 3840px wide and reviewed at 1920px: effective type is 30/38px.
LABEL_SIZE, TITLE_SIZE = 60, 76
TITLES = {'keyframes': '关键帧', 'transitions': '转场中间帧', 'custom': '自选时间帧'}


def verified_font_bytes(path, text):
    """Read-only shared provenance proof plus this board's exact glyph inventory.

    Render the verified snapshot, never reopen a potentially replaced font path.
    No preparation, download, or manifest rewrite is permitted at this entrypoint.
    """
    sys.path.insert(0, str(ROOT.parent / 'scripts'))
    from setup_fonts import verify_cached
    from fontTools.ttLib import TTFont
    path = Path(path)
    manifest_path = path.parent / 'prepared_font_manifest.json'
    manifest_bytes = manifest_path.read_bytes()
    previous = json.loads(manifest_bytes)[path.name]
    data = path.read_bytes()
    checksum = hashlib.sha256(data).hexdigest()
    verified = verify_cached(path, 'Sans', 'Regular', previous)
    if checksum != verified['sha256'] or checksum != previous.get('sha256'):
        raise ValueError('Contact sheet font checksum differs from verified provenance/manifest')
    if path.read_bytes() != data or manifest_path.read_bytes() != manifest_bytes:
        raise ValueError('Contact sheet font or manifest changed during verification')
    with TTFont(io.BytesIO(data)) as font:
        covered = {point for point, name in (font.getBestCmap() or {}).items()
                   if name != '.notdef' and font.getGlyphID(name) != 0}
        missing = sorted({c for c in text if not c.isspace() and ord(c) not in covered})
        if missing:
            raise ValueError(f'Contact sheet font missing characters: {missing!r}')
    return data


def board_title(manifest, group):
    return f"{TITLES[group]} · 原生{manifest['width']}×{manifest['height']}画面缩览"


def board_label(point):
    return f"{point['time_label']}  {point['label']}"


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
    return {'timeline_sha256': manifest['timeline']['sha256'], 'render_sha256': manifest['render']['sha256'], 'mode': manifest['mode'],
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
        if draw.textlength(char, font=font) > max_width:
            raise ValueError('Contact sheet label glyph exceeds column width')
        candidate = line + char
        if line and draw.textlength(candidate, font=font) > max_width:
            # Keep closing punctuation with its preceding glyph, rather than
            # stranding a full stop on a new caption line.
            if char in '，。！？；：、）】》”’' and len(line) > 1:
                lines.append(line[:-1])
                line = line[-1] + char
            else:
                lines.append(line)
                line = char
        else:
            line = candidate
    return lines + ([line] if line else [])


def board_layout(manifest, group, items, font, titlefont):
    """Measure every label before writing any board; never shrink requested type."""
    from PIL import Image, ImageDraw
    cols, tw, th = 4, 960, 540
    margin, gap, header = 44, 32, 160
    measure = ImageDraw.Draw(Image.new('RGB', (1, 1)))
    labels = [wrap_label(measure, board_label(point), font, tw - 2 * margin) for point in items]
    line_height = max(font.getbbox(text, anchor='lt')[3] for lines in labels for text in lines) + 24
    rh = th + 2 * gap + line_height * max(map(len, labels))
    rows = (len(items) + cols - 1) // cols
    title = board_title(manifest, group)
    title_box = measure.textbbox((margin, gap), title, font=titlefont, anchor='lt')
    if title_box[2] > cols * tw - margin or title_box[3] > header - gap:
        raise ValueError('Contact sheet title does not fit at the required font size')
    placements = []
    for i, lines in enumerate(labels):
        x, y = (i % cols) * tw, header + (i // cols) * rh
        for row, text in enumerate(lines):
            position = (x + margin, y + th + gap + row * line_height)
            bounds = measure.textbbox(position, text, font=font, anchor='lt')
            if bounds[0] < x + margin or bounds[2] > x + tw - margin or bounds[3] > y + rh - gap:
                raise ValueError('Contact sheet label exceeds measured column bounds')
            placements.append((position, text, bounds))
    return {'size': (tw * cols, rows * rh + header), 'rh': rh,
            'header': header, 'tile': (tw, th), 'cols': cols,
            'title': title, 'title_position': (margin, gap), 'title_bounds': title_box,
            'placements': placements}


def main(output=OUT, timeline_path=TIMELINE, font_path=FONT):
    output = Path(output)
    manifest, groups = load_checkpoints(output, timeline_path)
    # Validate all provenance and actual text coverage before Pillow can load a
    # font or overwrite any existing board, including a later group's failure.
    inventory = ''.join(board_title(manifest, group) + ''.join(board_label(point) for point in items)
                        for group, items in groups.items())
    font_bytes = verified_font_bytes(font_path, inventory)
    from PIL import Image, ImageDraw, ImageFont
    font = ImageFont.truetype(io.BytesIO(font_bytes), LABEL_SIZE)
    titlefont = ImageFont.truetype(io.BytesIO(font_bytes), TITLE_SIZE)
    layouts = {group: board_layout(manifest, group, items, font, titlefont) for group, items in groups.items()}
    products = {}
    for group, items in groups.items():
        layout = layouts[group]
        tw, th = layout['tile']
        sheet = Image.new('RGB', layout['size'], '#FFFEF8')
        draw = ImageDraw.Draw(sheet)
        draw.text(layout['title_position'], layout['title'], (36, 62, 102), font=titlefont, anchor='lt')
        for i, point in enumerate(items):
            with Image.open(io.BytesIO(read_frame_bytes(output, point, (manifest['width'], manifest['height']), checkpoint_metadata(manifest, point)))) as source:
                if source.size != (manifest['width'], manifest['height']):
                    raise ValueError(f"Still frame dimensions differ from manifest: {point['file']}")
                image = source.convert('RGB').resize((tw, th), Image.Resampling.LANCZOS)
            x, y = (i % layout['cols']) * tw, layout['header'] + (i // layout['cols']) * layout['rh']
            sheet.paste(image, (x, y))
        for position, text, _ in layout['placements']:
            draw.text(position, text, (36, 62, 102), font=font, anchor='lt')
        # Encode every group before touching any published board. A late decode
        # or PNG encoding failure therefore leaves the entire previous set intact.
        encoded = io.BytesIO()
        sheet.save(encoded, format='PNG', optimize=True)
        products[f'{group}_contact_sheet.png'] = encoded.getvalue()

    def validate_current_inputs():
        # Inputs may change during layout, decoding, staging or an earlier
        # replacement. Revalidate the full producer identity before EACH publish.
        current, _ = load_checkpoints(output, timeline_path)
        if current != manifest:
            raise ValueError('Still manifest changed while preparing contact sheets')

    sys.path.insert(0, str(ROOT.parent / 'scripts'))
    from narration_io import write_products
    # Ordinary publication failures restore the whole prior set. This is not
    # atomic to concurrent readers or durable across crashes/power loss.
    write_products(output, products, before_publish=validate_current_inputs)
    for name in products:
        print(output / name)


if __name__ == '__main__':
    main()
