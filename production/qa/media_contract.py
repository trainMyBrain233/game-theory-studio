"""Media contracts; metadata and box checks complement, never replace full decode."""
from fractions import Fraction
import math
import os


def video_frame_count(seconds, fps=30):
    """Match JS videoFrameCount: binary64 product, nonnegative ties up, safe integer."""
    error = 'Video window must produce at least one frame at the configured FPS.'
    if any(isinstance(value, bool) or not isinstance(value, (int, float)) for value in (seconds, fps)):
        raise ValueError(error)
    try:
        seconds, fps = float(seconds), float(fps)
    except (OverflowError, ValueError) as cause:
        raise ValueError(error) from cause
    if not all(math.isfinite(value) and value > 0 for value in (seconds, fps)):
        raise ValueError(error)
    frames = fps * seconds
    if not math.isfinite(frames):
        raise ValueError(error)
    # floor(frames + .5) double-rounds just-below-half and MAX_SAFE_INTEGER.
    whole = math.floor(frames)
    count = whole + (frames - whole >= .5)
    if not 1 <= count <= 2**53 - 1:
        raise ValueError(error)
    return count


def validate_streams(info, duration, fps=30):
    count = video_frame_count(duration, fps)
    streams = info.get('streams') if isinstance(info, dict) else None
    if not isinstance(streams, list):
        raise ValueError('Expected a list of media streams')
    # Validate every entry before selecting tracks: filtering first would silently
    # accept subtitle, data, attachment or unrecognized streams.
    for stream in streams:
        if not isinstance(stream, dict) or stream.get('codec_type') not in ('video', 'audio'):
            raise ValueError('Expected only video or audio stream objects')
    videos = [stream for stream in streams if stream['codec_type'] == 'video']
    audio = [stream for stream in streams if stream['codec_type'] == 'audio']
    if len(videos) != 1 or len(audio) > 1:
        raise ValueError('Expected one video and at most one audio stream')
    container = info.get('format')
    if not isinstance(container, dict):
        raise ValueError('Expected MP4 container metadata')
    # ffprobe shares this demuxer across MP4, QuickTime, 3GP and JPEG 2000.
    # Neither its name nor a .mp4 filename alone proves an MP4 delivery.
    names = container.get('format_name')
    if not isinstance(names, str) or 'mp4' not in names.split(','):
        raise ValueError('Expected MP4 container')
    tags = container.get('tags')
    brand = tags.get('major_brand') if isinstance(tags, dict) else None
    # Project delivery allowlist, not an exhaustive registry of MP4 brands.
    # Support common ISO base/AVC/MP4 brands for our H.264 MP4 contract.
    # Fail closed on missing/unknown brands, qt  (MOV), 3gp*/3g2*, M4A/M4V,
    # and MJ2. compatible_brands must not override a non-MP4 major brand.
    mp4_brands = ('isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'iso7',
                  'iso8', 'iso9', 'avc1', 'mp41', 'mp42')
    if brand not in mp4_brands:
        raise ValueError('Expected supported MP4 major brand')
    video = videos[0]
    expected = count / fps
    if video['codec_name'] != 'h264':
        raise ValueError('Expected H.264 video')
    if not all(Fraction(video[k]) == fps for k in ['r_frame_rate', 'avg_frame_rate']):
        raise ValueError('Frame rate mismatch')
    if int(video['nb_frames']) != count:
        raise ValueError('Video frame count mismatch')
    if not abs(float(info['format']['duration']) - expected) < .06:
        raise ValueError('Container duration mismatch')
    if (int(video['width']), int(video['height'])) not in [(1920, 1080), (3840, 2160)]:
        raise ValueError('Expected 1920x1080 or 3840x2160 video')
    if video['pix_fmt'] != 'yuv420p' or video.get('sample_aspect_ratio') != '1:1':
        raise ValueError('Expected yuv420p video with square pixels')
    if video.get('color_range') != 'tv':
        raise ValueError('Expected encoded limited-range SDR')
    if not all(video[k] == 'bt709' for k in ['color_space', 'color_primaries', 'color_transfer']):
        raise ValueError('Expected BT.709 color metadata')
    for stream in [video, *audio]:
        start, length = float(stream['start_time']), float(stream['duration'])
        if not math.isfinite(start) or abs(start) > 1 / fps:
            raise ValueError('Stream does not start at zero')
        if not math.isfinite(length) or abs(length - expected) >= .06:
            raise ValueError('Stream duration mismatch')
    for stream in audio:
        if stream['codec_name'] != 'aac' or int(stream['sample_rate']) != 48000:
            raise ValueError('Expected 48 kHz AAC audio')
        if int(stream['channels']) not in [1, 2]:
            raise ValueError('Expected mono or stereo audio')
    return video, audio, count


def validate_faststart(path):
    """Check top-level ISO BMFF box order with constant memory and bounded work.

    Only headers are read; seek over media payloads instead of loading a film.
    This structural check complements ffprobe and full decode, not their contents.
    """
    moov = None
    first_mdat = None
    with path.open('rb') as stream:
        length = os.fstat(stream.fileno()).st_size
        offset = 0
        boxes = 0
        while offset < length:
            boxes += 1
            if boxes > 100000:
                raise ValueError('MP4 box count exceeds validation limit')
            stream.seek(offset)
            header = stream.read(8)
            if len(header) != 8:
                raise ValueError('Truncated MP4 box header')
            size = int.from_bytes(header[:4], 'big')
            kind = header[4:]
            header_size = 8
            if size == 1:
                extended = stream.read(8)
                if len(extended) != 8:
                    raise ValueError('Truncated MP4 largesize header')
                size = int.from_bytes(extended, 'big')
                header_size = 16
            elif size == 0:
                # A zero-sized box extends to EOF, never to the next marker.
                size = length - offset
            if kind == b'uuid':
                header_size += 16
            if size < header_size or size > length - offset:
                raise ValueError('Invalid or truncated MP4 box size')
            if kind == b'moov':
                if moov is not None:
                    raise ValueError('Expected exactly one top-level MP4 moov box')
                moov = offset
            elif kind == b'mdat' and first_mdat is None:
                first_mdat = offset
            offset += size
        if moov is None or first_mdat is None:
            raise ValueError('Expected top-level MP4 moov and mdat boxes')
        if moov > first_mdat:
            raise ValueError('Expected MP4 faststart: moov must precede mdat')
    return {'moov_offset': moov, 'first_mdat_offset': first_mdat}
