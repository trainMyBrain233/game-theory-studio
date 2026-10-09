import copy
import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('media_contract', Path(__file__).resolve().parents[1] / 'production/qa/media_contract.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class MediaContract(unittest.TestCase):
    def fixture(self):
        return {'format': {'duration': '1.000'}, 'streams': [dict(codec_type='video',codec_name='h264',r_frame_rate='30/1',avg_frame_rate='30/1',nb_frames='30',width=1920,height=1080,pix_fmt='yuv420p',sample_aspect_ratio='1:1',color_range='tv',color_space='bt709',color_primaries='bt709',color_transfer='bt709',start_time='0.0',duration='1.0')]}

    def test_silent_and_sfx_tracks(self):
        info = self.fixture()
        self.assertEqual(module.validate_streams(info, 1)[2], 30)
        info['streams'].append(dict(codec_type='audio',codec_name='aac',sample_rate='48000',channels=2,start_time='0.0',duration='1.02'))
        self.assertEqual(len(module.validate_streams(info, 1)[1]), 1)
        for field, value in [('start_time', '.1'), ('duration', '1.2'), ('sample_rate', '44100')]:
            broken = copy.deepcopy(info)
            broken['streams'][1][field] = value
            with self.assertRaises(ValueError): module.validate_streams(broken, 1)

    def test_range_rate_and_each_stream_timing(self):
        for field, value in [('color_range', 'pc'), ('avg_frame_rate', '60/1'), ('start_time', '.1'), ('duration', '0.5')]:
            info = self.fixture()
            info['streams'][0][field] = value
            with self.assertRaises(ValueError): module.validate_streams(info, 1)

    def test_shared_encoder_frame_count_contract(self):
        cases = json.loads((Path(__file__).parent / 'fixtures/video-frame-count-contract.json').read_text(encoding='utf-8'))
        def number(value):
            return float(value['nonFinite']) if isinstance(value, dict) and 'nonFinite' in value else value
        for fixture in cases:
            with self.subTest(fixture=fixture['name']):
                seconds, fps = number(fixture['seconds']), number(fixture['fps'])
                if fixture.get('error'):
                    with self.assertRaisesRegex(ValueError, 'at least one frame'):
                        module.video_frame_count(seconds, fps)
                    # Invalid windows fail before interpreting stream metadata.
                    with self.assertRaises(ValueError):
                        module.validate_streams({}, seconds, fps)
                else:
                    self.assertEqual(module.video_frame_count(seconds, fps), fixture['frames'])
        self.assertEqual(module.video_frame_count(.15), 5)

    def test_half_frame_metadata_matches_the_encoder_not_python_even_rounding(self):
        for seconds, frames in [(.15, 5), (.35, 11), (.14999999999999997, 4), (.15000000000000002, 5), (.3499999999999999, 10), (.35000000000000003, 11)]:
            with self.subTest(seconds=seconds):
                info = self.fixture()
                info['format']['duration'] = str(frames / 30)
                info['streams'][0].update(nb_frames=str(frames), duration=str(frames / 30))
                self.assertEqual(module.validate_streams(info, seconds)[2], frames)
                info['streams'][0]['nb_frames'] = str(frames - 1)
                with self.assertRaises(ValueError):
                    module.validate_streams(info, seconds)
