import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';

export const TIMELINE_PATH = 'chapters/01-four-elements/narration/timeline.json';
export const STILLS_MANIFEST = 'stills-manifest.json';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Stable semantic anchors, never absolute episode seconds. Keyframes sample the
// current segment's reading pause; a segment with no pause uses its final
// in-window instant instead, without claiming an after-speech reading pause.
const KEYFRAMES = [
  's01_hook', 's02_four_questions', 's06_definition', 's08_known_unknown',
  's10_distinction', 's14_simple_case', 's17_comparison_example',
  's23_score_order', 's25_rr_score', 's27_rb_score', 's29_br_score',
  's31_bb_score', 's37_closing',
];
// Offsets describe the existing scene choreography relative to its live anchor.
const TRANSITIONS = [
  ['section', 'players', .15, '标题退入'],
  ['section', 'information', .15, '信息章节转场'],
  ['section', 'strategy', .3, '选择集合展开'],
  ['segment', 's16_comparison_intro', .25, '情境转换'],
  ['segment', 's16_comparison_intro', .65, '保留同一角色'],
  ['segment', 's18_return_single_round', 3, '回到一轮'],
  ['segment', 's21_rows', .6, '角色身份移动'],
  ['segment', 's21_rows', 2, '矩阵成形'],
  ['section', 'recap', .65, '同一矩阵收排'],
];
const readable = text => String(text).replace(/\s+/g, ' ').trim();
function anchor(timeline, kind, id) {
  const matches = timeline[kind === 'section' ? 'sections' : 'segments'].filter(item => item.id === id);
  if (matches.length !== 1) throw Error(`Checkpoint requires exactly one ${kind} anchor: ${id}`);
  const item = matches[0];
  if (!Number.isFinite(item.start) || !Number.isFinite(item.end) || item.start < 0 || item.end <= item.start || item.end > timeline.duration) throw Error(`Invalid checkpoint anchor window: ${id}`);
  return item;
}
function inside(time, item, id) {
  if (!Number.isFinite(time) || time < item.start || time >= item.end) throw Error(`Checkpoint lies outside its current anchor: ${id}`);
  return time;
}
// All anchor ends are finite and positive. The preceding Float64 stays inside
// even a one-ULP segment, unlike a fixed frame/epsilon subtraction. This also
// keeps a rounded midpoint from accidentally selecting the next segment.
function beforeEnd(end) {
  const bits = new DataView(new ArrayBuffer(8));
  bits.setFloat64(0, end);
  bits.setBigUint64(0, bits.getBigUint64(0) - 1n);
  return bits.getFloat64(0);
}

export function checkpointPlan(timeline) {
  if (!Number.isFinite(timeline.duration) || timeline.duration <= 0 || !Array.isArray(timeline.sections) || !Array.isArray(timeline.segments)) throw Error('Checkpoints require a current episode timeline.');
  const keyframes = KEYFRAMES.map(id => {
    const segment = anchor(timeline, 'segment', id);
    if (!Number.isFinite(segment.voiceover_end) || segment.voiceover_end <= segment.start || segment.voiceover_end > segment.end) throw Error(`Invalid checkpoint speech window: ${id}`);
    const phase = segment.voiceover_end === segment.end ? 'segment_end_interior' : 'reading_pause_midpoint';
    const midpoint = segment.voiceover_end + (segment.end - segment.voiceover_end) / 2;
    const time = inside(midpoint < segment.end ? midpoint : beforeEnd(segment.end), segment, id);
    return {id, group: 'keyframes', time, label: readable(segment.voiceover), anchor: {kind: 'segment', id, phase}};
  });
  const transitions = TRANSITIONS.map(([kind, id, offset, label]) => {
    const item = anchor(timeline, kind, id);
    return {id: `${id}_${offset}`, group: 'transitions', time: inside(item.start + offset, item, id), label, anchor: {kind, id, offset}};
  });
  return [...keyframes, ...transitions];
}

export function createStillsManifest(timelineBytes, {width = 1920, times} = {}) {
  const timeline = JSON.parse(timelineBytes.toString());
  if (times !== undefined && (!Array.isArray(times) || !times.length || times.some(time => !Number.isFinite(time)))) throw Error('Explicit still times must be a nonempty finite array.');
  if (![1920, 3840].includes(width)) throw Error('Still manifest width must be 1920 or 3840.');
  const checkpoints = times === undefined ? checkpointPlan(timeline) : times.map((time, index) => {
    const segment = timeline.segments.find(item => time >= item.start && time < item.end);
    if (!segment) throw Error(`Explicit still time has no current timeline segment: ${time}`);
    return {id: `custom_${index + 1}`, group: 'custom', time, label: readable(segment.voiceover), anchor: {kind: 'segment', id: segment.id, phase: 'explicit'}};
  });
  if (!checkpoints.length) throw Error('Still manifest must contain checkpoints.');
  const files = new Set();
  for (const point of checkpoints) {
    if (!Number.isFinite(point.time) || point.time < 0 || point.time >= timeline.duration || !point.label) throw Error(`Invalid checkpoint: ${point.id}`);
    const stamp = point.time.toFixed(2);
    point.time_label = `${stamp}s`;
    point.file = `frame_${stamp}_${width}.png`;
    if (files.has(point.file)) throw Error('Still times must have unique two-decimal filenames.');
    files.add(point.file);
  }
  return {schema_version: 1, mode: times === undefined ? 'default' : 'custom', ...(times === undefined ? {} : {explicit_times: [...times]}), timeline: {path: TIMELINE_PATH, sha256: sha256(timelineBytes), duration: timeline.duration}, width, height: width * 9 / 16, checkpoints};
}

/** Embed the checkpoint identity in the rendered PNG before hashing it. This
 * binds the manifest's labels/times to those exact image bytes, including custom
 * requests; an unchanged PNG cannot silently acquire a different checkpoint. */
export function stampCheckpointPng(png, manifest, point) {
  const {sha256: imageHash, ...checkpoint} = point;
  const metadata = {timeline_sha256: manifest.timeline.sha256, mode: manifest.mode, checkpoint};
  // ASCII JSON makes a standards-compliant PNG tEXt chunk; Unicode label text
  // round-trips through JSON escapes instead of putting UTF-8 in a Latin-1 field.
  const json = JSON.stringify(metadata).replace(/[^\x20-\x7e]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
  const payload = Buffer.from(`StudioCheckpoint\0${json}`), kind = Buffer.from('tEXt');
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([kind, payload])) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const header = Buffer.alloc(4), checksum = Buffer.alloc(4);
  header.writeUInt32BE(payload.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  if (!Buffer.isBuffer(png) || !png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || png.subarray(-12, -4).toString('hex') !== '0000000049454e44') throw Error('Cannot stamp a non-PNG still.');
  return Buffer.concat([png.subarray(0, -12), header, kind, payload, checksum, png.subarray(-12)]);
}

/** One producer/consumer metadata contract, without a second Python schedule. */
export function verifyStillsManifest(manifest, timelineBytes) {
  if (manifest?.schema_version !== 1 || !['default', 'custom'].includes(manifest.mode)) throw Error('Invalid still checkpoint manifest mode or version; render episode stills again.');
  if (manifest.timeline?.sha256 !== sha256(timelineBytes)) throw Error('Stale still checkpoint manifest: timeline changed; render episode stills again.');
  const expected = createStillsManifest(timelineBytes, {width: manifest.width, ...(manifest.mode === 'custom' ? {times: manifest.explicit_times} : {})});
  if (manifest.mode === 'custom' && !Array.isArray(manifest.explicit_times)) throw Error('Custom checkpoint manifest requires its explicit requested times.');
  if (!Array.isArray(manifest.checkpoints) || manifest.checkpoints.some(point => !point || !/^[a-f0-9]{64}$/.test(point.sha256))) throw Error('Still checkpoint manifest requires a SHA256 for every rendered PNG.');
  const metadata = {...manifest, checkpoints: manifest.checkpoints.map(({sha256: imageHash, ...point}) => point)};
  if (!isDeepStrictEqual(metadata, expected)) throw Error('Still checkpoint manifest metadata differs from its current timeline and requested mode; render episode stills again.');
  return manifest;
}

// The Python contact-sheet consumer calls this same verifier with a byte-exact
// timeline snapshot. No images, native Canvas, fonts or encoder are loaded here.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3 || process.argv[2] !== '--verify-manifest') throw Error('Usage: checkpoints.mjs --verify-manifest (JSON on stdin)');
    const request = JSON.parse(fs.readFileSync(0, 'utf8'));
    verifyStillsManifest(request.manifest, Buffer.from(request.timeline_base64, 'base64'));
    console.log('Checkpoint metadata verified against current timeline.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
