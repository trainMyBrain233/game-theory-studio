"""Pure stream contract; metadata checks complement, never replace full decode."""
from fractions import Fraction
import math


def validate_streams(info, duration, fps=30):
    videos = [s for s in info['streams'] if s['codec_type'] == 'video']
    audio = [s for s in info['streams'] if s['codec_type'] == 'audio']
    assert len(videos) == 1 and len(audio) <= 1, 'Expected one video and at most one audio stream'
    video = videos[0]
    count = round(fps * duration)
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
