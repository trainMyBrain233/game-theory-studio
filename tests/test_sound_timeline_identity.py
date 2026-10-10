"""Real short SFX builds bind publication to the exact canonical timeline bytes."""
import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import wave

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'production'))
sys.path.insert(0, str(ROOT / 'scripts'))
import make_sound
import narration_io
from sound_plan import plan_cues

WAV = Path('output/original_sparse_sfx.wav')
MANIFEST = Path('qa/sound_manifest.json')
TIMELINE = Path('chapters/01-four-elements/narration/timeline.json')


def fixture():
    return {'duration': 1, 'name': 'Alice', 'segments': [{
        'id': 'score', 'start': 0, 'end': 1,
        'visual_cue': {'action': 'reveal_scores', 'score_reveals': [
            {'player': 'A', 'offset': .1}, {'player': 'B', 'offset': .4}]}}]}


def changed(value, kind):
    value = copy.deepcopy(value)
    if kind == 'cue':
        value['segments'][0]['visual_cue']['score_reveals'][0]['offset'] = .2
    else:
        value['name'] = 'Eliza'
    return value


def write_timeline(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')


def products(root):
    return {str(path.relative_to(root)): path.read_bytes()
            for path in root.rglob('*') if path.is_file()} if root.exists() else {}


@unittest.skipUnless(importlib.util.find_spec('numpy'), 'optional NumPy synthesis dependency is not installed')
class SoundTimelineIdentityTests(unittest.TestCase):
    @contextlib.contextmanager
    def build_context(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            timeline = root / TIMELINE
            write_timeline(timeline, fixture())
            production = root / 'production'
            # Only omit chapter-specific bindings: real planning, NumPy synthesis,
            # WAV encoding and publication all execute on this one-second fixture.
            with patch.object(make_sound, 'ROOT', production), patch.object(
                    make_sound, 'plan_cues', side_effect=lambda value: plan_cues(value, bindings=())), contextlib.redirect_stdout(io.StringIO()):
                yield production, timeline

    def test_unchanged_build_is_deterministic_and_identifies_exact_input(self):
        with self.build_context() as (production, timeline):
            make_sound.main()
            first = products(production)
            manifest = json.loads((production / MANIFEST).read_bytes())
            self.assertEqual(manifest['timeline_sha256'], hashlib.sha256(timeline.read_bytes()).hexdigest())
            self.assertEqual(manifest['alignment'], 'manual-reference')
            self.assertFalse(manifest['speech'])
            self.assertEqual([event['time'] for event in manifest['events']], [.1, .4])
            with wave.open(str(production / WAV), 'rb') as audio:
                self.assertEqual(audio.getparams()[:4], (2, 2, 48000, 48000))
            make_sound.main()
            self.assertEqual(products(production), first)

    def test_same_duration_cue_and_name_edits_change_manifest_identity(self):
        for kind in ('cue', 'name'):
            with self.subTest(kind=kind), self.build_context() as (production, timeline):
                make_sound.main()
                before = products(production)
                old_manifest = json.loads(before[str(MANIFEST)])
                write_timeline(timeline, changed(fixture(), kind))
                make_sound.main()
                new_manifest = json.loads((production / MANIFEST).read_bytes())
                self.assertEqual(new_manifest['duration'], old_manifest['duration'])
                self.assertNotEqual(new_manifest['timeline_sha256'], old_manifest['timeline_sha256'])
                self.assertEqual(new_manifest['timeline_sha256'], hashlib.sha256(timeline.read_bytes()).hexdigest())
                if kind == 'cue':
                    self.assertNotEqual((production / WAV).read_bytes(), before[str(WAV)])
                else:
                    self.assertEqual((production / WAV).read_bytes(), before[str(WAV)])

    def test_synthesis_time_same_duration_mutation_preserves_previous_real_wav(self):
        for kind in ('cue', 'name'):
            with self.subTest(kind=kind), self.build_context() as (production, timeline):
                make_sound.main()
                before = products(production)
                original_synthesize = make_sound.synthesize
                def synthesize(value):
                    result = original_synthesize(value)
                    write_timeline(timeline, changed(value, kind))
                    return result
                with patch.object(make_sound, 'synthesize', side_effect=synthesize):
                    with patch.object(narration_io.os, 'replace') as replace:
                        with self.assertRaisesRegex(RuntimeError, 'Timeline changed'):
                            make_sound.main()
                        replace.assert_not_called()
                self.assertEqual(products(production), before)

    def test_input_mutation_between_replacements_rolls_back_entire_set(self):
        for existing in (False, True):
            with self.subTest(existing=existing), self.build_context() as (production, timeline):
                if existing:
                    make_sound.main()
                before = products(production)
                # Make the attempted new WAV different from the saved real WAV,
                # so byte equality after failure proves restoration actually ran.
                write_timeline(timeline, changed(fixture(), 'cue'))
                original_replace = os.replace
                replacements = []
                def replace(source, target):
                    result = original_replace(source, target)
                    replacements.append(Path(target).relative_to(production))
                    if len(replacements) == 1:
                        if existing:
                            self.assertNotEqual(Path(target).read_bytes(), before[str(WAV)])
                        write_timeline(timeline, changed(json.loads(timeline.read_bytes()), 'name'))
                    return result
                with patch.object(narration_io.os, 'replace', side_effect=replace):
                    with self.assertRaisesRegex(RuntimeError, 'Timeline changed'):
                        make_sound.main()
                self.assertEqual(replacements[0], WAV)
                self.assertNotIn(MANIFEST, replacements)
                self.assertEqual(products(production), before)
                self.assertFalse(any(production.glob('.narration-*')))
                if not existing:
                    self.assertFalse(production.exists())

    def test_disappearing_input_preserves_previous_products(self):
        with self.build_context() as (production, timeline):
            make_sound.main()
            before = products(production)
            original_synthesize = make_sound.synthesize
            def synthesize(value):
                result = original_synthesize(value)
                timeline.unlink()
                return result
            with patch.object(make_sound, 'synthesize', side_effect=synthesize):
                with self.assertRaisesRegex(RuntimeError, 'Timeline changed'):
                    make_sound.main()
            self.assertEqual(products(production), before)


if __name__ == '__main__':
    unittest.main()
