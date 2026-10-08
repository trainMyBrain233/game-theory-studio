"""Semantic SFX timing contracts, without optional NumPy/audio dependencies."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "production"))
from sound_plan import CHAPTER_01_CUES, CueBinding, plan_cues


def legacy_fixture():
    # An independent, frozen fixture for the pre-extraction 173.3 s cue plan.
    # Current narration may change legitimately; that must not stale this golden.
    windows = [
        ("s01_hook", 0, 6.5), ("s02_four_questions", 6.5, 11.2),
        ("s03_question", 11.2, 14.4), ("s07_question", 30.8, 34.6),
        ("s08_known_unknown", 34.6, 41), ("s09_simultaneous", 41, 45.1),
        ("s12_question", 56.1, 59.1), ("s13_options", 59.1, 64.3),
        ("s16_comparison_intro", 75.1, 78.4), ("s17_comparison_example", 78.4, 84.3),
        ("s18_return_single_round", 84.3, 90.1), ("s21_rows", 98.2, 102.7),
        ("s22_columns", 102.7, 105.9), ("s23_score_order", 105.9, 111.3),
        ("s25_rr_score", 115.4, 118.8), ("s27_rb_score", 122.7, 127.4),
        ("s29_br_score", 131.3, 136), ("s31_bb_score", 140.1, 143.6),
        ("s34_intro", 155.8, 158.8), ("s35_first_pair", 158.8, 162.4),
        ("s36_second_pair", 162.4, 166),
    ]
    segments = [{"id": key, "start": start, "end": end,
                 "visual_cue": {"action": "fixture"}} for key, start, end in windows]
    for segment in segments:
        if segment["id"] in ("s25_rr_score", "s31_bb_score"):
            offsets = (1.8, 1.8)
        elif segment["id"] in ("s27_rb_score", "s29_br_score"):
            offsets = (1.0, 3.0)
        else:
            continue
        segment["visual_cue"] = {"action": "reveal_scores", "score_reveals": [
            {"player": "A", "offset": offsets[0]}, {"player": "B", "offset": offsets[1]}]}
    return {"duration": 173.3, "segments": segments}


class SoundPlanTests(unittest.TestCase):
    def test_original_thirty_onsets_kinds_pan_and_synthesis_order(self):
        actual = [(cue.time, cue.kind, cue.pan) for cue in plan_cues(legacy_fixture())]
        expected = [(at, "paper", 0) for at in [
            .7, 11.55, 31.15, 56.45, 75.3, 87.1, 98.4, 155.9]]
        expected += [(at, "tap", 0) for at in [
            6.9, 35.0, 37.6, 43.05, 59.5, 61.4, 78.65, 80.45,
            81.6, 99.8, 103.05, 106.25, 158.95, 160.3, 162.6, 164.0]]
        expected += [(117.2, "tap", -.12), (123.7, "tap", -.12),
                     (125.7, "tap", .12), (132.3, "tap", -.12),
                     (134.3, "tap", .12), (141.9, "tap", -.12)]
        self.assertEqual(actual, expected)

    def test_current_timeline_resolves_onsets_from_semantic_segments(self):
        timeline = json.loads((ROOT / "chapters/01-four-elements/narration/timeline.json").read_text(encoding="utf-8"))
        segments = {segment["id"]: segment for segment in timeline["segments"]}
        plan = plan_cues(timeline)
        score_onsets = sum(len({reveal["offset"] for reveal in segment["visual_cue"]["score_reveals"]})
                           for segment in timeline["segments"] if segment["visual_cue"]["action"] == "reveal_scores")
        self.assertEqual(len(plan), len(CHAPTER_01_CUES) + score_onsets)
        for event in plan:
            self.assertEqual(event.time, round(segments[event.segment_id]["start"] + event.offset, 9))
            self.assertLess(event.time, segments[event.segment_id]["end"])

    def test_timeline_insertion_moves_every_later_sound_by_the_same_delta(self):
        original = legacy_fixture()
        changed = copy.deepcopy(original)
        delta = 4.25
        cutoff = 34.6
        for segment in changed["segments"]:
            if segment["start"] >= cutoff:
                segment["start"] += delta
                segment["end"] += delta
            elif segment["end"] == cutoff:
                segment["end"] += delta
        changed["duration"] += delta
        baseline = plan_cues(original)
        mutated = plan_cues(changed)
        self.assertEqual(len(mutated), len(baseline))
        starts = {segment["id"]: segment["start"] for segment in original["segments"]}
        for before, after in zip(baseline, mutated):
            self.assertEqual((before.segment_id, before.offset, before.kind, before.pan),
                             (after.segment_id, after.offset, after.kind, after.pan))
            self.assertEqual(after.time, round(before.time + (delta if starts[before.segment_id] >= cutoff else 0), 9))

    def test_duration_and_score_offset_changes_follow_the_current_timeline(self):
        changed = legacy_fixture()
        segment = next(item for item in changed["segments"] if item["id"] == "s27_rb_score")
        segment["end"] += 1.25
        segment["visual_cue"]["score_reveals"][1]["offset"] += .6
        events = [event for event in plan_cues(changed) if event.segment_id == segment["id"]]
        self.assertEqual([(event.time, event.pan) for event in events], [(123.7, -.12), (126.3, .12)])

    def test_reordering_segments_and_score_events_preserves_the_entire_plan(self):
        changed = legacy_fixture()
        expected = plan_cues(changed)
        changed["segments"].reverse()
        for segment in changed["segments"]:
            if segment["visual_cue"]["action"] == "reveal_scores":
                segment["visual_cue"]["score_reveals"].reverse()
        self.assertEqual(plan_cues(changed), expected)
        # Simultaneous reveals have one stable A-panned tap, not two louder taps.
        for key in ("s25_rr_score", "s31_bb_score"):
            events = [event for event in expected if event.segment_id == key]
            self.assertEqual(len(events), 1)
            self.assertEqual(events[0].pan, -.12)

    def test_missing_semantic_anchor_fails(self):
        timeline = legacy_fixture()
        timeline["segments"] = [item for item in timeline["segments"] if item["id"] != "s08_known_unknown"]
        with self.assertRaisesRegex(ValueError, "missing sound segment: s08_known_unknown"):
            plan_cues(timeline)

    def test_invalid_fixed_offsets_and_unsupported_parameters_fail(self):
        for offset in [-.1, float("nan"), float("inf"), True, None, 6.5, 7]:
            with self.subTest(offset=offset), self.assertRaises(ValueError):
                plan_cues(legacy_fixture(), (CueBinding("s01_hook", offset),))
        for binding in [CueBinding("s01_hook", .5, "music"), CueBinding("s01_hook", .5, pan=2)]:
            with self.subTest(binding=binding), self.assertRaises(ValueError):
                plan_cues(legacy_fixture(), (binding,))

    def test_shortened_anchor_fails_instead_of_emitting_a_late_cue(self):
        changed = legacy_fixture()
        segment = next(item for item in changed["segments"] if item["id"] == "s17_comparison_example")
        segment["end"] = segment["start"] + 3.2
        with self.assertRaisesRegex(ValueError, "s17_comparison_example sound offset 3.2 is outside"):
            plan_cues(changed)

    def test_invalid_score_offsets_and_owner_contract_fail(self):
        for offset in [-1, float("nan"), True, None, 4.7, 10]:
            changed = legacy_fixture()
            segment = next(item for item in changed["segments"] if item["id"] == "s27_rb_score")
            segment["visual_cue"]["score_reveals"][1]["offset"] = offset
            with self.subTest(offset=offset), self.assertRaises(ValueError):
                plan_cues(changed)
        for reveals in [None, [], [{"player": "A", "offset": 1}],
                        [{"player": "A", "offset": 1}, {"player": "A", "offset": 1}],
                        [{"player": "A", "offset": 1}, {"player": None, "offset": 1}]]:
            changed = legacy_fixture()
            segment = next(item for item in changed["segments"] if item["id"] == "s27_rb_score")
            segment["visual_cue"]["score_reveals"] = reveals
            with self.subTest(reveals=reveals), self.assertRaisesRegex(ValueError, "one A and one B"):
                plan_cues(changed)

    def test_planner_is_pure_and_importable_without_site_packages(self):
        timeline = legacy_fixture()
        before = copy.deepcopy(timeline)
        plan_cues(timeline)
        self.assertEqual(timeline, before)
        code = "import sound_plan, sys; assert 'numpy' not in sys.modules; assert len(sound_plan.CHAPTER_01_CUES) == 24"
        run = subprocess.run([sys.executable, "-S", "-c", code], cwd=ROOT / "production", capture_output=True)
        self.assertEqual(run.returncode, 0, run.stderr.decode("utf-8"))


if __name__ == "__main__":
    unittest.main()
