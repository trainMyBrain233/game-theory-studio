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
    assert len(videos) == 1 and len(audio) <= 1, 'Expected one video and at most one audio stream'
    video = videos[0]
    expected = count / fps
    assert video['codec_name'] == 'h264'
    assert all(Fraction(video[k]) == fps for k in ['r_frame_rate', 'avg_frame_rate']), 'Frame rate mismatch'
    assert int(video['nb_frames']) == count
    assert abs(float(info['format']['duration']) - expected) < .06
    assert (int(video['width']), int(video['height'])) in [(1920, 1080), (3840, 2160)]
    assert video['pix_fmt'] == 'yuv420p' and video.get('sample_aspect_ratio') == '1:1'
    assert video.get('color_range') == 'tv', 'Expected encoded limited-range SDR'
    assert all(video[k] == 'bt709' for k in ['color_space', 'color_primaries', 'color_transfer'])
    for stream in [video, *audio]:
        start, length = float(stream['start_time']), float(stream['duration'])
        assert math.isfinite(start) and abs(start) <= 1 / fps, 'Stream does not start at zero'
        assert math.isfinite(length) and abs(length - expected) < .06, 'Stream duration mismatch'
    for stream in audio:
        assert stream['codec_name'] == 'aac' and int(stream['sample_rate']) == 48000
        assert int(stream['channels']) in [1, 2]
    return video, audio, count
