"""Resolve restrained, original SFX against semantic timeline segments.

This module uses only the Python standard library. Offsets are seconds from the
named segment's start, not absolute episode times or fractions of its duration.
A shortened segment that cannot contain an onset fails before synthesis. These
reference-timeline bindings do not claim alignment with recorded speech.
"""
from dataclasses import dataclass
import math


@dataclass(frozen=True)
class CueBinding:
    segment_id: str
    offset: float
    kind: str = "tap"
    pan: float = 0


@dataclass(frozen=True)
class PlannedCue:
    segment_id: str
    offset: float
    time: float
    kind: str
    pan: float


# Preserve the existing synthesis order: all paper noise first, then UI taps,
# then score taps. Changing that order would change the seeded paper waveform.
CHAPTER_01_CUES = (
    CueBinding("s01_hook", .7, "paper"),
    CueBinding("s03_question", .35, "paper"),
    CueBinding("s07_question", .35, "paper"),
    CueBinding("s12_question", .35, "paper"),
    CueBinding("s16_comparison_intro", .2, "paper"),
    CueBinding("s18_return_single_round", 2.8, "paper"),
    CueBinding("s21_rows", .2, "paper"),
    CueBinding("s34_intro", .1, "paper"),
    CueBinding("s02_four_questions", .4),
    CueBinding("s08_known_unknown", .4),
    CueBinding("s08_known_unknown", 3.0),
    CueBinding("s09_simultaneous", 2.05),
    CueBinding("s13_options", .4),
    CueBinding("s13_options", 2.3),
    CueBinding("s17_comparison_example", .25),
    CueBinding("s17_comparison_example", 2.05),
    CueBinding("s17_comparison_example", 3.2),
    CueBinding("s21_rows", 1.6),
    CueBinding("s22_columns", .35),
    CueBinding("s23_score_order", .35),
    CueBinding("s35_first_pair", .15),
    CueBinding("s35_first_pair", 1.5),
    CueBinding("s36_second_pair", .2),
    CueBinding("s36_second_pair", 1.6),
)


def _number(value, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{label} must be a finite number")
    return value


def _segments(timeline):
    duration = _number(timeline.get("duration"), "timeline duration")
    if duration <= 0:
        raise ValueError("timeline duration must be positive")
    segments = timeline.get("segments")
    if not isinstance(segments, list) or not segments:
        raise ValueError("timeline segments must be a nonempty list")
    by_id = {}
    for segment in segments:
        if not isinstance(segment, dict) or not isinstance(segment.get("id"), str) or not segment["id"]:
            raise ValueError("every sound segment requires an id")
        segment_id = segment["id"]
        if segment_id in by_id:
            raise ValueError(f"duplicate sound segment: {segment_id}")
        start = _number(segment.get("start"), f"{segment_id} start")
        end = _number(segment.get("end"), f"{segment_id} end")
        if start < 0 or end <= start or end > duration:
            raise ValueError(f"{segment_id} has an invalid timeline window")
        if not isinstance(segment.get("visual_cue"), dict):
            raise ValueError(f"{segment_id} requires a visual cue")
        by_id[segment_id] = segment
    return by_id


def _resolve(binding, segments):
    if binding.segment_id not in segments:
        raise ValueError(f"missing sound segment: {binding.segment_id}")
    segment = segments[binding.segment_id]
    offset = _number(binding.offset, f"{binding.segment_id} sound offset")
    window = round(segment["end"] - segment["start"], 9)
    if offset < 0 or offset >= window:
        raise ValueError(f"{binding.segment_id} sound offset {offset} is outside its segment window")
    if binding.kind not in ("tap", "paper"):
        raise ValueError(f"unsupported sound kind: {binding.kind}")
    pan = _number(binding.pan, f"{binding.segment_id} sound pan")
    if not -1 <= pan <= 1:
        raise ValueError(f"{binding.segment_id} sound pan must be in [-1, 1]")
    # Timeline seconds have finite decimal precision. Avoid incidental binary
    # addition noise in manifests without changing 48 kHz sample positions.
    return PlannedCue(binding.segment_id, offset, round(segment["start"] + offset, 9), binding.kind, pan)


def plan_cues(timeline, bindings=CHAPTER_01_CUES):
    """Return deterministic onset plans without audio arrays, files or clocks.

    Score offsets come from complete-cell visual cues. Simultaneous A/B onsets
    remain one tap with A's pan, regardless of event storage order. Non-score
    bindings are chapter-specific; new chapters must author their own bindings.
    """
    if not isinstance(timeline, dict):
        raise ValueError("timeline must be an object")
    segments = _segments(timeline)
    planned = [_resolve(binding, segments) for binding in bindings]
    for segment in sorted(segments.values(), key=lambda item: (item["start"], item["id"])):
        cue = segment["visual_cue"]
        if cue.get("action") != "reveal_scores":
            continue
        reveals = cue.get("score_reveals")
        if (not isinstance(reveals, list) or len(reveals) != 2
                or any(not isinstance(reveal, dict) for reveal in reveals)
                or any(reveal.get("player") not in ("A", "B") for reveal in reveals)
                or sorted(reveal.get("player", "") for reveal in reveals) != ["A", "B"]):
            raise ValueError(f"{segment['id']} score sounds require one A and one B event")
        # Resolve every event before deduplication, so an invalid B event cannot
        # hide behind an A onset at the same time.
        score_cues = [_resolve(CueBinding(segment["id"], reveal.get("offset"), "tap",
                                         -.12 if reveal["player"] == "A" else .12), segments)
                      for reveal in sorted(reveals, key=lambda reveal: reveal["player"])]
        seen_offsets = set()
        for score in sorted(score_cues, key=lambda item: (item.offset, item.pan)):
            if score.offset not in seen_offsets:
                planned.append(score)
                seen_offsets.add(score.offset)
    return tuple(planned)
