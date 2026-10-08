import copy
import importlib.util
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
            with self.assertRaises(AssertionError): module.validate_streams(broken, 1)

    def test_range_rate_and_each_stream_timing(self):
        for field, value in [('color_range', 'pc'), ('avg_frame_rate', '60/1'), ('start_time', '.1'), ('duration', '0.5')]:
            info = self.fixture()
            info['streams'][0][field] = value
            with self.assertRaises(AssertionError): module.validate_streams(info, 1)

