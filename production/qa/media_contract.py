"""Pure stream contract; metadata checks complement, never replace full decode."""
from fractions import Fraction
import math


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
    videos = [s for s in info['streams'] if s['codec_type'] == 'video']
    audio = [s for s in info['streams'] if s['codec_type'] == 'audio']
    if len(videos) != 1 or len(audio) > 1:
        raise ValueError('Expected one video and at most one audio stream')
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
