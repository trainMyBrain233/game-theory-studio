"""Execute the real QA paths with controlled inputs under every optimization mode.

Font tables and ffmpeg output are test doubles; hashes, manifests, reports and
validation code are real. This suite never renders or decodes large media.
"""
import copy
from contextlib import redirect_stdout
import io
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'production/qa'))
import media_contract
import verify_media
import check_fonts
import qa_font_provenance

spec = importlib.util.spec_from_file_location('qa_glyphs', ROOT / 'scripts/qa_glyphs.py')
qa_glyphs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa_glyphs)


def media_fixture():
    return {'format': {'duration': '1.000', 'format_name': 'mov,mp4,m4a,3gp,3g2,mj2',
                           'tags': {'major_brand': 'isom', 'compatible_brands': 'isomiso2avc1mp41'}}, 'streams': [dict(
        codec_type='video', codec_name='h264', r_frame_rate='30/1',
        avg_frame_rate='30/1', nb_frames='30', width=1920, height=1080,
        pix_fmt='yuv420p', sample_aspect_ratio='1:1', color_range='tv',
        color_space='bt709', color_primaries='bt709', color_transfer='bt709',
        start_time='0.0', duration='1.0'), dict(
        codec_type='audio', codec_name='aac', sample_rate='48000', channels=2,
        start_time='0.0', duration='1.0')]}


class ValidationFixtures(unittest.TestCase):
    def setUp(self):
        self.enterContext(redirect_stdout(io.StringIO()))

    def test_glyph_mutations_and_report(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fonts = root / 'typography/fonts'
            qa = root / 'typography/qa'
            fonts.mkdir(parents=True)
            qa.mkdir(parents=True)
            (qa / 'text-runs.json').write_text(json.dumps({'textRuns': ['中文 A']}), encoding='utf-8')
            manifest = {}
            tables = {}
            for kind in ['Sans', 'Serif']:
                for weight, number in [('Regular', 400), ('Bold', 700)]:
                    name = f'Noto{kind}CJKSC-{weight}.otf'
                    data = name.encode()
                    (fonts / name).write_bytes(data)
                    manifest[name] = {'sha256': hashlib.sha256(data).hexdigest()}
                    tables[name] = dict(family=f'Noto {kind} CJK SC', weight=number,
                                        glyphs=20000, cmap={ord(c): c for c in '中文A博弈论入门参与者信息策略收益每种组合各得什么红蓝小B'})
            manifest_path = fonts / 'prepared_font_manifest.json'
            manifest_path.write_text(json.dumps(manifest), encoding='utf-8')

            class Face:
                def __init__(self, source): self.table = tables[source.name]
                def __enter__(self): return self
                def __exit__(self, *args): return False
                def __getitem__(self, key):
                    if key == 'name':
                        return SimpleNamespace(getDebugName=lambda _: self.table['family'],
                            names=[SimpleNamespace(nameID=1, toUnicode=lambda: self.table['family'])])
                    if key == 'OS/2':
                        return SimpleNamespace(usWeightClass=self.table['weight'])
                    raise KeyError(key)
                def getGlyphOrder(self): return range(self.table['glyphs'])
                def getBestCmap(self): return self.table['cmap']
                def getGlyphID(self, name): return 0 if name == '.notdef' else 1

            with patch.object(qa_glyphs, 'TTFont', Face):
                qa_glyphs.main(root)
                report = qa / 'glyphs.json'
                self.assertEqual(len(json.loads(report.read_text())), 4)
                self.assertTrue(all(item['unique_characters_checked'] == 3 for item in json.loads(report.read_text())))
                # Mutate every face, including late failures after prior valid faces.
                for name in tables:
                    original = copy.deepcopy(tables[name])
                    for field, value, message in [
                        ('family', 'Noto Sans CJK JP', 'unexpected family'),
                        ('weight', 500, 'expected weight'),
                        ('glyphs', 19999, 'complete SC face'),
                        ('cmap', {ord('A'): 'A'}, 'missing characters'),
                    ]:
                        with self.subTest(font=name, field=field):
                            report.unlink(missing_ok=True)
                            tables[name][field] = value
                            with self.assertRaisesRegex(ValueError, message):
                                qa_glyphs.main(root)
                            self.assertFalse(report.exists())
                            tables[name] = copy.deepcopy(original)
                    with self.subTest(font=name, field='sha256'):
                        report.unlink(missing_ok=True)
                        source = fonts / name
                        original_bytes = source.read_bytes()
                        source.write_bytes(original_bytes + b'corruption')
                        with self.assertRaisesRegex(ValueError, 'SHA256 mismatch'):
                            qa_glyphs.main(root)
                        self.assertFalse(report.exists())
                        source.write_bytes(original_bytes)

            production = root / 'production'
            (production / 'qa').mkdir(parents=True)
            (production / 'qa/checks.json').write_text(json.dumps({'text_inventory': ['中文 A']}), encoding='utf-8')
            production_report = production / 'qa/font_checks.json'
            with patch.object(check_fonts, 'TTFont', Face), patch.object(check_fonts, 'verify_cached') as verify:
                check_fonts.main(production)
                self.assertEqual(len(json.loads(production_report.read_text())), 4)
                self.assertEqual(verify.call_count, 4)
                for name in tables:
                    original = copy.deepcopy(tables[name])
                    for field, value, message in [
                        ('family', 'Noto Sans CJK JP', 'unexpected family'),
                        ('weight', 500, 'expected weight'),
                        ('cmap', {ord('A'): 'A'}, 'missing characters'),
                    ]:
                        with self.subTest(production_font=name, field=field):
                            production_report.unlink(missing_ok=True)
                            tables[name][field] = value
                            with self.assertRaisesRegex(ValueError, message): check_fonts.main(production)
                            self.assertFalse(production_report.exists())
                            tables[name] = copy.deepcopy(original)
                    production_report.unlink(missing_ok=True)
                    source = fonts / name
                    original_bytes = source.read_bytes()
                    source.write_bytes(original_bytes + b'corruption')
                    with self.assertRaisesRegex(ValueError, 'SHA256 mismatch'): check_fonts.main(production)
                    self.assertFalse(production_report.exists())
                    source.write_bytes(original_bytes)
                verify.side_effect = ValueError('Rejected subset/provenance by verify_cached')
                with self.assertRaisesRegex(ValueError, 'subset/provenance'): check_fonts.main(production)
                self.assertFalse(production_report.exists())

    def test_provenance_negative_acceptance_gates(self):
        # Run the provenance QA's complete control flow with tiny stand-in bytes.
        # Mutate its verifier's outcomes, never the QA implementation itself.
        with tempfile.TemporaryDirectory() as directory:
            repository = Path(directory)
            source = repository / 'typography/fonts'
            source.mkdir(parents=True)
            entries = {}
            for kind, weight in qa_font_provenance.setup_fonts.OFFICIAL_SHA256:
                name = f'Noto{kind}CJKSC-{weight}.otf'
                (source / name).write_bytes(name.encode())
                entries[name] = {'sha256': hashlib.sha256(name.encode()).hexdigest(),
                                 'source_kind': 'local_ttc_extraction', 'source': str(source / 'fixture.ttc')}
            (source / 'prepared_font_manifest.json').write_text(json.dumps(entries), encoding='utf-8')
            class Collection:
                def save(self, path): Path(path).write_bytes(b'TTC fixture')
                def close(self): pass

            def exercise(mutation):
                calls = 0
                def setup_main():
                    nonlocal calls
                    calls += 1
                    argv = sys.argv
                    output = Path(argv[argv.index('--output-dir') + 1])
                    manifest = output / 'prepared_font_manifest.json'
                    if calls in [1, 5]:
                        if mutation == f'accept-forgery-{calls}': return 0
                        if mutation == f'wrong-error-{calls}':
                            print('unrelated failure', file=sys.stderr)
                            return 1
                        if mutation == f'rewrite-manifest-{calls}': manifest.write_text('{}')
                        print('re-extracted mismatch', file=sys.stderr)
                        return 1
                    if mutation == f'preparation-failure-{calls}': return 1
                    if calls == 2:
                        target = output / 'NotoSansCJKSC-Regular.otf'
                        if mutation != 'bad-recovery': target.write_bytes((source / target.name).read_bytes())
                    if calls == 3:
                        output.mkdir()
                        local_entries = copy.deepcopy(entries)
                        if mutation == 'wrong-provenance':
                            for entry in local_entries.values(): entry['source_kind'] = 'official'
                        manifest.write_text(json.dumps(local_entries), encoding='utf-8')
                        for name in entries: (output / name).write_bytes((source / name).read_bytes())
                    if calls == 4 and mutation == 'rewrite-valid-manifest': manifest.write_text('{}')
                    return 0
                with patch.object(qa_font_provenance.setup_fonts, 'main', side_effect=setup_main), \
                     patch.object(qa_font_provenance.setup_fonts, 'verify', side_effect=lambda path, *_: {'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}), \
                     patch.object(qa_font_provenance, 'TTFont', side_effect=lambda *a, **kw: {}), \
                     patch.object(qa_font_provenance, 'TTCollection', Collection):
                    qa_font_provenance.main(repository)
            exercise(None)
            for mutation in ['accept-forgery-1', 'wrong-error-1', 'rewrite-manifest-1',
                             'preparation-failure-2', 'bad-recovery', 'preparation-failure-3',
                             'preparation-failure-4', 'rewrite-valid-manifest', 'wrong-provenance',
                             'accept-forgery-5', 'wrong-error-5', 'rewrite-manifest-5']:
                with self.subTest(provenance_mutation=mutation):
                    with self.assertRaises(RuntimeError): exercise(mutation)

    def test_media_metadata_mutations(self):
        valid = media_fixture()
        self.assertEqual(media_contract.validate_streams(valid, 1)[2], 30)
        alternate = copy.deepcopy(valid)
        alternate['streams'][0].update(width=3840, height=2160)
        alternate['streams'][1]['channels'] = 1
        self.assertEqual(media_contract.validate_streams(alternate, 1)[2], 30)
        silent = copy.deepcopy(valid)
        silent['streams'].pop()
        self.assertEqual(media_contract.validate_streams(silent, 1)[1], [])
        for stream_index, mutations in [
            (0, [('codec_name', 'vp9'), ('r_frame_rate', '24/1'),
                 ('avg_frame_rate', '60/1'), ('nb_frames', '29'),
                 ('width', 1280), ('height', 720), ('pix_fmt', 'yuv444p'),
                 ('sample_aspect_ratio', '2:1'), ('color_range', 'pc'),
                 ('color_space', 'bt2020nc'), ('color_primaries', 'bt2020'),
                 ('color_transfer', 'smpte2084')]),
            (1, [('codec_name', 'mp3'), ('sample_rate', '44100'), ('channels', 6)]),
            (0, [('start_time', '.1'), ('start_time', 'nan'), ('start_time', 'inf'),
                 ('duration', '.5'), ('duration', 'nan'), ('duration', 'inf')]),
            (1, [('start_time', '.1'), ('start_time', 'nan'), ('start_time', 'inf'),
                 ('duration', '.5'), ('duration', 'nan'), ('duration', 'inf')]),
        ]:
            for field, value in mutations:
                with self.subTest(stream=stream_index, field=field, value=value):
                    broken = copy.deepcopy(valid)
                    broken['streams'][stream_index][field] = value
                    with self.assertRaises(ValueError):
                        media_contract.validate_streams(broken, 1)
        for value in ['.5', 'nan', 'inf']:
            with self.subTest(container_duration=value):
                broken = copy.deepcopy(valid)
                broken['format']['duration'] = value
                with self.assertRaises(ValueError): media_contract.validate_streams(broken, 1)
        for streams in [[], valid['streams'][1:], [valid['streams'][0]] * 2,
                        valid['streams'] + [valid['streams'][1]]]:
            with self.subTest(streams=streams):
                with self.assertRaises(ValueError):
                    media_contract.validate_streams({'streams': streams}, 1)

    def test_decode_mutations_and_report(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            production = root / 'production'
            (production / 'qa').mkdir(parents=True)
            timeline = root / 'chapters/01-four-elements/narration/timeline.json'
            timeline.parent.mkdir(parents=True)
            timeline.write_text(json.dumps({'duration': 2}), encoding='utf-8')
            source = root / 'fixture.mp4'
            source.write_bytes(b'controlled media fixture')
            report = production / 'qa/media_fixture.mp4.json'
            with patch.object(verify_media.shutil, 'which', return_value='/fake/tool'), \
                 patch.object(verify_media.subprocess, 'check_output', return_value=json.dumps(media_fixture()).encode()) as probe, \
                 patch.object(verify_media.subprocess, 'run') as decode:
                decode.return_value = SimpleNamespace(returncode=0, stderr='', stdout='frame=1\nframe=30\nprogress=end\n')
                verify_media.main(['--duration', '1', str(source)], production)
                self.assertEqual(json.loads(report.read_text())['full_decode']['frames'], 30)
                self.assertEqual(json.loads(report.read_text())['full_decode']['status'], 'passed')
                # Exercise all supported resolution/audio combinations through the
                # real entry point; stream ordering must not affect acceptance.
                for dimensions in [(1920, 1080), (3840, 2160)]:
                    for channels in [None, 1, 2]:
                        for reverse in [False, True]:
                            with self.subTest(dimensions=dimensions, channels=channels, reverse=reverse):
                                valid = media_fixture()
                                valid['streams'][0].update(width=dimensions[0], height=dimensions[1])
                                if channels is None:
                                    valid['streams'].pop()
                                else:
                                    valid['streams'][1]['channels'] = channels
                                if reverse:
                                    valid['streams'].reverse()
                                probe.return_value = json.dumps(valid).encode()
                                report.unlink(missing_ok=True)
                                decode.reset_mock()
                                verify_media.main(['--duration', '1', str(source)], production)
                                decode.assert_called_once()
                                written = json.loads(report.read_text())
                                self.assertEqual(written['audio_tracks'], int(channels is not None))
                                self.assertEqual(written['video']['width'], dimensions[0])
                                self.assertEqual(written['full_decode']['status'], 'passed')
                # Unexpected entries must be rejected BEFORE decode or report writes,
                # including under -O/-OO and PYTHONOPTIMIZE (see OptimizationModes).
                extras = [dict(codec_type=kind) for kind in
                          ['subtitle', 'data', 'attachment', 'unknown', 'Video', '', None, [], {}]]
                extras += [{}, None, 'audio', [], 0, True]
                invalid = []
                for extra in extras:
                    for with_audio in [False, True]:
                        broken = media_fixture()
                        if not with_audio:
                            broken['streams'].pop()
                        broken['streams'].append(extra)
                        invalid.append(broken)
                valid = media_fixture()
                invalid += [{'streams': streams} for streams in [
                    [], valid['streams'][1:], [valid['streams'][0]] * 2,
                    valid['streams'] + [valid['streams'][1]], None, {}, 'video']]
                invalid += [None, [], {}]
                for broken in invalid:
                    with self.subTest(invalid_probe=broken):
                        probe.return_value = json.dumps(broken).encode()
                        report.unlink(missing_ok=True)
                        decode.reset_mock()
                        with self.assertRaises(ValueError):
                            verify_media.main(['--duration', '1', str(source)], production)
                        decode.assert_not_called()
                        self.assertFalse(report.exists())
                probe.return_value = json.dumps(media_fixture()).encode()
                for status, stderr, stdout in [
                    (1, '', 'frame=30\n'), (0, 'decode error', 'frame=30\n'),
                    (0, '', 'frame=29\n'), (0, '', 'frame=31\n'),
                    (0, '', ''), (0, '', 'frame=30\nframe=29\n'),
                    (0, '', 'frame=invalid\n'),
                ]:
                    with self.subTest(status=status, stderr=stderr, stdout=stdout):
                        report.unlink(missing_ok=True)
                        decode.return_value = SimpleNamespace(returncode=status, stderr=stderr, stdout=stdout)
                        with self.assertRaises((RuntimeError, ValueError)):
                            verify_media.main(['--duration', '1', str(source)], production)
                        self.assertFalse(report.exists())


class OptimizationModes(unittest.TestCase):
    def test_validation_survives_flags_and_environment(self):
        for flags, optimization in [([], None), (['-O'], None), (['-OO'], None),
                                    ([], '1'), ([], '2')]:
            with self.subTest(flags=flags, PYTHONOPTIMIZE=optimization):
                env = os.environ.copy()
                env.pop('PYTHONOPTIMIZE', None)
                if optimization is not None:
                    env['PYTHONOPTIMIZE'] = optimization
                result = subprocess.run(
                    [sys.executable, *flags, str(Path(__file__).resolve()), 'ValidationFixtures'],
                    env=env, capture_output=True, text=True, timeout=30)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn('Ran 4 tests', result.stderr)


if __name__ == '__main__':
    unittest.main()
