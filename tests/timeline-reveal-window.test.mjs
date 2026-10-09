import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {ROOT} from '../scripts/python.mjs';
import {readJSON, validateTimeline, validateFirstEpisodeTimeline} from '../scripts/validate-data.mjs';

const scenes = readJSON(path.join(ROOT, 'design/scenes.json'));
const generic = readJSON(path.join(ROOT, 'chapters/00-original-example/narration/timeline.json'));
const episode = readJSON(path.join(ROOT, 'chapters/01-four-elements/narration/timeline.json'));

// Independent IEEE-754 fixture construction, without the renderer's time helper.
function previousFloat(value) {
  const bytes = new ArrayBuffer(8);
  const view = new DataView(bytes);
  view.setFloat64(0, value);
  view.setBigUint64(0, view.getBigUint64(0) - 1n);
  return view.getFloat64(0);
}

for (const [name, source, validate] of [
  ['generic chapter', generic, validateTimeline],
  ['first episode through generic validator', episode, validateTimeline],
  ['first episode', episode, validateFirstEpisodeTimeline],
]) {
  function fixture() {
    const document = structuredClone(source);
    const segment = document.segments.find(item => item.visual_cue.action === 'reveal_scores');
    return {document, segment, event: segment.visual_cue.score_reveals[1]};
  }
  function speechEndsAt(segment, time) {
    // Preserve all display windows, continuity, text and semantic anchors.
    segment.voiceover_end = time;
    segment.spoken_duration = time - segment.start;
    segment.pause_after = segment.end - time;
  }
  function rejectsDisplayWindow(document, segment) {
    assert.throws(() => validate(document, scenes), {
      name: 'AssertionError',
      message: new RegExp(`${segment.id}: score reveal must occur within the segment display window`),
    });
  }

  test(`${name}: shipped timings and speech-end reveals with positive pause remain valid`, () => {
    validate(source, scenes);
    const {document, segment, event} = fixture();
    assert(segment.pause_after > 0);
    event.offset = segment.spoken_duration;
    assert(segment.start + event.offset < segment.end);
    validate(document, scenes);
  });

  test(`${name}: zero pause permits reveals at the inclusive start and just inside the end`, () => {
    const {document, segment, event} = fixture();
    speechEndsAt(segment, segment.end);
    segment.visual_cue.score_reveals[0].offset = 0;
    event.offset = previousFloat(segment.end) - segment.start;
    assert.equal(segment.start + event.offset, previousFloat(segment.end));
    validate(document, scenes);
  });

  test(`${name}: a one-ULP positive pause accepts a reveal exactly at speech end`, () => {
    const {document, segment, event} = fixture();
    speechEndsAt(segment, previousFloat(segment.end));
    event.offset = segment.spoken_duration;
    assert(segment.pause_after > 0 && segment.pause_after < 1e-6);
    assert.equal(segment.start + event.offset, previousFloat(segment.end));
    validate(document, scenes);
  });

  test(`${name}: zero pause rejects a reveal exactly at the exclusive display end`, () => {
    const {document, segment, event} = fixture();
    speechEndsAt(segment, segment.end);
    event.offset = segment.spoken_duration;
    assert.equal(segment.start + event.offset, segment.end);
    rejectsDisplayWindow(document, segment);
  });

  test(`${name}: an offset below speech duration can round up to the exclusive end`, () => {
    const {document, segment, event} = fixture();
    speechEndsAt(segment, segment.end);
    event.offset = previousFloat(segment.spoken_duration);
    assert(event.offset < segment.spoken_duration);
    assert.equal(segment.start + event.offset, segment.end, 'The fixture must reproduce addition rounding.');
    rejectsDisplayWindow(document, segment);
  });

  test(`${name}: a positive pause lost to addition rounding cannot rescue an end reveal`, () => {
    const {document, segment, event} = fixture();
    speechEndsAt(segment, segment.end);
    segment.pause_after = Number.EPSILON;
    event.offset = segment.spoken_duration;
    assert(segment.pause_after > 0);
    assert.equal(segment.voiceover_end + segment.pause_after, segment.end);
    assert.equal(segment.start + event.offset, segment.end);
    rejectsDisplayWindow(document, segment);
  });

  test(`${name}: approximate timing consistency does not allow a reveal after the display end`, () => {
    const {document, segment, event} = fixture();
    speechEndsAt(segment, segment.end);
    segment.spoken_duration += 5e-7;
    event.offset = segment.spoken_duration;
    assert(segment.start + event.offset > segment.end);
    rejectsDisplayWindow(document, segment);
  });
}
