import '../scripts/isolated-fonts.mjs';
import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas as nativeCreateCanvas} from '@napi-rs/canvas';
import {alphaInkBounds, createAvatarTransition, sampleAvatarTransition, drawAvatarSample} from '../production/src/animatic/avatar.mjs';
import {assertAvatarSampleInFrame, assertAvatarTrackInFrame, assertAvatarTextClearance} from '../production/src/animatic/geometry.mjs';

const surfaces = [];
function createCanvas(width, height) {
  const canvas = nativeCreateCanvas(width, height);
  surfaces.push(canvas);
  return canvas;
}
afterEach(() => {
  for (const canvas of surfaces) { canvas.width = 1; canvas.height = 1; }
  surfaces.length = 0;
});
const SIZE = {width:1920, height:1080};
const pose = (changes = {}) => ({x:100, y:200, scale:1, side:1, alpha:1, ...changes});
const track = (from = pose(), to = pose({x:400, y:300, scale:2}), easing = 'smoothstep') =>
  createAvatarTransition({startFrame:2, endFrame:18, from, to, easing});

/** Original asymmetric toy pixels with meaningful transparent padding. */
function fixture() {
  const canvas = createCanvas(24, 28), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#243E66'; ctx.fillRect(4, 6, 9, 13); ctx.clearRect(4, 6, 4, 5);
  const pixel = ctx.createImageData(1, 1); pixel.data.set([255, 0, 0, 1]); ctx.putImageData(pixel, 16, 22);
  const expected = {x:4, y:6, width:13, height:17};
  assert.deepEqual(alphaInkBounds(canvas), expected, 'The faintest alpha is part of measured bounds.');
  return {id:'synthetic', width:24, height:28, alphaBounds:expected, draw:target => target.drawImage(canvas, 0, 0)};
}
function paddedSquare() {
  const canvas = createCanvas(40, 40);
  canvas.getContext('2d').fillRect(10, 10, 10, 10);
  return {id:'square', width:40, height:40, alphaBounds:alphaInkBounds(canvas), draw:ctx => ctx.drawImage(canvas, 0, 0)};
}
function paint(canvas, adapter, sample, offset = 0) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
  ctx.save();
  try { ctx.translate(offset, offset); drawAvatarSample(ctx, adapter, sample); }
  finally { ctx.restore(); }
}
function nonzeroAlpha(canvas, x, y, width, height) {
  const bytes = canvas.getContext('2d').getImageData(x, y, width, height).data;
  let count = 0;
  for (let i = 3; i < bytes.length; i += 4) count += bytes[i] !== 0;
  return count;
}

/** Independently draw an expanded canvas; compare every retained alpha pixel. */
function overscanOracle(adapter, size = SIZE) {
  const margin = 32, clipped = createCanvas(size.width, size.height);
  const expanded = createCanvas(size.width + margin * 2, size.height + margin * 2);
  return sample => {
    paint(clipped, adapter, sample); paint(expanded, adapter, sample, margin);
    // Read the full intrinsic draw rectangle, including its transparent padding,
    // plus one device pixel. This is independent of the measured alpha envelope
    // under test and avoids allocating two 8MB full-frame copies per sample.
    const x = Math.max(0, Math.floor(sample.x) - 1), y = Math.max(0, Math.floor(sample.y) - 1);
    const right = Math.min(size.width, Math.ceil(sample.x + adapter.width * sample.scale) + 1);
    const bottom = Math.min(size.height, Math.ceil(sample.y + adapter.height * sample.scale) + 1);
    const expected = expanded.getContext('2d').getImageData(margin + x, margin + y, right - x, bottom - y).data;
    const actual = clipped.getContext('2d').getImageData(x, y, right - x, bottom - y).data;
    // Translating the backend's sampling grid can change alpha rounding by one
    // byte. Compare visible support exactly, and alpha within that quantization.
    for (let i = 3; i < actual.length; i += 4) {
      assert.equal(actual[i] !== 0, expected[i] !== 0, 'In-frame visible ink must match the independent overscan raster.');
      assert(Math.abs(actual[i] - expected[i]) <= 1, 'Overscan alpha differs by more than one quantization level.');
    }
    return nonzeroAlpha(expanded, 0, 0, expanded.width, margin) +
      nonzeroAlpha(expanded, 0, margin + size.height, expanded.width, margin) +
      nonzeroAlpha(expanded, 0, margin, margin, size.height) +
      nonzeroAlpha(expanded, margin + size.width, margin, margin, size.height);
  };
}

test('measured alpha support, mirror direction, and transparent source padding drive frame bounds', () => {
  const adapter = fixture();
  for (const side of [1, -1]) {
    assert.deepEqual(assertAvatarSampleInFrame(adapter, pose({scale:2, side}), SIZE),
      {x:side === 1 ? 107 : 113, y:211, width:28, height:36});
    const sample = pose({x:side === 1 ? -7 : -13, y:-11, scale:2, side});
    const bounds = assertAvatarSampleInFrame(adapter, sample, SIZE);
    assert.equal(bounds.x, 0); assert.equal(bounds.y, 0);
    assert(sample.x < 0 && sample.y < 0, 'Only source padding extends outside the frame.');
    assert.equal(overscanOracle(adapter)(sample), 0);
  }
  const source = createCanvas(16, 20); source.getContext('2d').fillRect(0, 0, 16, 20);
  const bleed = {id:'full-bleed', width:16, height:20, alphaBounds:alphaInkBounds(source), draw:ctx => ctx.drawImage(source, 0, 0)};
  const tiny = {width:16, height:20};
  for (const side of [1, -1]) {
    const sample = pose({x:0, y:0, side});
    assert.deepEqual(assertAvatarSampleInFrame(bleed, sample, tiny), {x:0, y:0, ...tiny});
    assert.equal(overscanOracle(bleed, tiny)(sample), 0, 'No invented padding is required beyond the source edge.');
  }
});

test('affine endpoint proof contains all integer frames for every easing and mirror side', () => {
  const adapter = fixture(), inspect = overscanOracle(adapter);
  for (const easing of ['linear', 'smoothstep', 'smootherstep']) for (const side of [1, -1]) {
    // Independent source support constants, not obtained from the validator.
    const left = side === 1 ? 3.5 : 6.5, right = side === 1 ? 17.5 : 20.5;
    const from = pose({x:-left * 1.25 + 0.125, y:-5.5 * 1.25 + 0.125, scale:1.25, side, alpha:0.2});
    const to = pose({x:SIZE.width - right * 2.75 - 0.125, y:SIZE.height - 23.5 * 2.75 - 0.125, scale:2.75, side});
    const transition = track(from, to, easing);
    assertAvatarTrackInFrame(adapter, transition, SIZE);
    const seen = new Set();
    for (let frame = transition.startFrame - 1; frame <= transition.endFrame + 1; frame++) {
      const sample = sampleAvatarTransition(transition, frame);
      assertAvatarSampleInFrame(adapter, sample, SIZE);
      assert.equal(inspect(sample), 0, `${easing}, side ${side}, frame ${frame} must retain every visible alpha pixel.`);
      seen.add(frame);
    }
    for (const frame of [1, 2, 6, 10, 14, 18, 19]) assert(seen.has(frame), 'Includes start/mid/end, quarters, and adjacent clamps.');
    assertAvatarSampleInFrame(adapter, sampleAvatarTransition(transition, Number.MIN_SAFE_INTEGER), SIZE);
    assertAvatarSampleInFrame(adapter, sampleAvatarTransition(transition, Number.MAX_SAFE_INTEGER), SIZE);
  }
});

test('upscaled filtering can clip even when the unfiltered measured rectangle touches the edge', () => {
  const adapter = paddedSquare(), inspect = overscanOracle(adapter, {width:120, height:120});
  for (const side of [1, -1]) for (const scale of [1.1, 1.5, 2, 3, 10]) {
    const sample = pose({x:-(side === 1 ? 10 : 20) * scale, y:-10 * scale, scale, side});
    assert.throws(() => assertAvatarSampleInFrame(adapter, sample, {width:120, height:120}), /filtered alpha footprint/);
    assert(inspect(sample) > 0, `Scale ${scale}, mirror ${side}: rejected pose actually loses visible filtered alpha.`);
  }
});

test('fractional, unit, and minified scales retain their actual alpha at all four frame corners', () => {
  const adapter = fixture(), size = {width:320, height:240}, inspect = overscanOracle(adapter, size);
  for (const side of [1, -1]) for (const scale of [0.05, 0.1, 0.35, 0.5, 0.8, 1, 1.1, 2.5, 10]) {
    const left = side === 1 ? 3.5 : 6.5, right = side === 1 ? 17.5 : 20.5;
    for (const x of [-left * scale, size.width - right * scale]) {
      for (const y of [-5.5 * scale, size.height - 23.5 * scale]) {
        const sample = pose({x, y, scale, side});
        assertAvatarSampleInFrame(adapter, sample, size);
        assert.equal(inspect(sample), 0, `Scale ${scale}, side ${side}, corner ${x},${y} must not lose visible ink.`);
      }
    }
  }
});

test('machine-roundoff at affine edge contact never rejects valid frames or licenses a real offset', () => {
  const source = createCanvas(16, 20); source.getContext('2d').fillRect(4, 6, 7, 11);
  const adapter = {id:'edge-contact', width:16, height:20, alphaBounds:alphaInkBounds(source), draw:ctx => ctx.drawImage(source, 0, 0)};
  const size = {width:160, height:120}, inspect = overscanOracle(adapter, size);
  let outwardRoundoffs = 0;
  for (const easing of ['linear', 'smoothstep', 'smootherstep']) for (const side of [1, -1]) {
    const left = side === 1 ? 3.5 : 4.5, right = side === 1 ? 11.5 : 12.5;
    // Preserve the review's exact Number input, including -2.8000000000000003.
    const reported = createAvatarTransition({startFrame:0, endFrame:50, easing,
      from:pose({x:-left * 0.8, y:400, scale:0.8, side}), to:pose({x:-left * 3, y:400, scale:3, side})});
    assertAvatarTrackInFrame(adapter, reported, SIZE);
    for (let frame = 0; frame <= 50; frame++) {
      const sample = sampleAvatarTransition(reported, frame);
      if (sample.x + left * sample.scale < 0) outwardRoundoffs++;
      assertAvatarSampleInFrame(adapter, sample, SIZE);
    }
    for (const horizontal of ['left', 'right']) for (const vertical of ['top', 'bottom']) {
      const endpoint = scale => pose({
        x:horizontal === 'left' ? -left * scale : size.width - right * scale,
        y:vertical === 'top' ? -5.5 * scale : size.height - 17.5 * scale, scale, side,
      });
      const transition = createAvatarTransition({startFrame:0, endFrame:50, easing, from:endpoint(0.8), to:endpoint(3)});
      assertAvatarTrackInFrame(adapter, transition, size);
      for (let frame = -1; frame <= 51; frame++) {
        const sample = sampleAvatarTransition(transition, frame);
        assertAvatarSampleInFrame(adapter, sample, size);
        assert.equal(inspect(sample), 0, `${easing}/${side}/${horizontal}/${vertical}/${frame} must retain all alpha.`);
        for (const magnitude of [1e-11, 1e-7]) {
          for (const [key, delta] of [['x', horizontal === 'left' ? -magnitude : magnitude], ['y', vertical === 'top' ? -magnitude : magnitude]]) {
            assert.throws(() => assertAvatarSampleInFrame(adapter, {...sample, [key]:sample[key] + delta}, size), /filtered alpha footprint/,
              'An offset above the machine-precision budget must still fail.');
          }
        }
      }
    }
  }
  assert(outwardRoundoffs > 0, 'The regression must actually exercise outward floating-point roundoff.');
});

test('all four edges, overscale, and mirrored clipping reject either endpoint, including invisible endpoints', () => {
  const adapter = fixture(), inspect = overscanOracle(adapter);
  for (const side of [1, -1]) {
    const left = side === 1 ? 3.5 : 6.5, right = side === 1 ? 17.5 : 20.5;
    const bad = [
      pose({side, x:-left - 6}), pose({side, y:-5.5 - 6}),
      pose({side, x:SIZE.width - right + 6}), pose({side, y:SIZE.height - 23.5 + 6}),
      pose({side, scale:70}),
    ];
    for (const sample of bad) {
      assert.throws(() => assertAvatarSampleInFrame(adapter, sample, SIZE), /inside 1920x1080/);
      assert(inspect(sample) > 0, 'The independent overscan exposes real lost pixels.');
      for (const alpha of [0, 1]) {
        const endpoint = {...sample, alpha}, valid = pose({side});
        assert.throws(() => assertAvatarTrackInFrame(adapter, track(endpoint, valid), SIZE), /filtered alpha footprint/);
        assert.throws(() => assertAvatarTrackInFrame(adapter, track(valid, endpoint), SIZE), /filtered alpha footprint/);
      }
    }
  }
});

test('sample and track validation reject unsupported geometry without executing providers', () => {
  const adapter = {...fixture(), draw() { assert.fail('Geometry validation must never execute provider code.'); }};
  assertAvatarTrackInFrame(adapter, track(), SIZE);
  for (const changes of [{x:NaN}, {y:Infinity}, {scale:0}, {scale:-1}, {scale:Number.MAX_VALUE}, {side:0}, {alpha:-1}, {alpha:2}]) {
    assert.throws(() => assertAvatarSampleInFrame(adapter, pose(changes), SIZE));
  }
  for (const sample of [null, [], undefined]) assert.throws(() => assertAvatarSampleInFrame(adapter, sample, SIZE));
  for (const size of [null, {}, {width:0, height:10}, {width:10, height:-1}, {width:10.1, height:10}, {width:Infinity, height:10}]) {
    assert.throws(() => assertAvatarSampleInFrame(adapter, pose(), size), /positive safe integers/);
  }
  for (const changes of [{easing:'overshoot'}, {to:pose({side:-1})}, {endFrame:2}]) {
    assert.throws(() => assertAvatarTrackInFrame(adapter, {...track(), ...changes}, SIZE));
  }
});

function masks(width = 180, height = 100) { return [createCanvas(width, height), createCanvas(width, height)]; }
function rect(canvas, x, y, width = 1, height = 1) { canvas.getContext('2d').fillRect(x, y, width, height); }
function clear(canvas) { canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); }

test('mask clearance distinguishes exactly 31 versus 32 empty pixels on every axis and boundary', () => {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const [avatar, text] = masks(); rect(avatar, 70, 50);
    rect(text, 70 + dx * 33, 50 + dy * 33);
    assert.doesNotThrow(() => assertAvatarTextClearance(avatar, text));
    clear(text); rect(text, 70 + dx * 32, 50 + dy * 32);
    assert.throws(() => assertAvatarTextClearance(avatar, text), /32px clearance/);
  }
  const [avatar, text] = masks(34, 1); rect(avatar, 0, 0); rect(text, 33, 0);
  assertAvatarTextClearance(avatar, text);
  clear(text); rect(text, 32, 0);
  assert.throws(() => assertAvatarTextClearance(avatar, text), /clearance/);
});

test('clearance errors report frozen actual pixel witnesses and the nearest conservative gap', () => {
  const [avatar, text] = masks(); rect(avatar, 10, 10); rect(text, 42, 10);
  const check = (actualGap, avatarPixel) => {
    assert.throws(() => assertAvatarTextClearance(avatar, text), error => {
      assert(error instanceof RangeError); assert.match(error.message, /32px clearance/);
      assert.deepEqual(error.details, {
        textPixel:{x:42, y:10}, avatarPixel, actualGap, requiredGap:32, metric:'chebyshev_pixel_gap',
      });
      for (const value of [error.details, error.details.textPixel, error.details.avatarPixel]) assert(Object.isFrozen(value));
      assert.throws(() => { error.details.actualGap = 32; }, TypeError);
      assert.throws(() => { error.details.avatarPixel.x = 0; }, TypeError);
      assert.throws(() => { error.details = {}; }, TypeError);
      return true;
    });
  };
  check(31, {x:10, y:10});
  // The nearest witness occurs later in raster order and can be almost hidden.
  const ctx = avatar.getContext('2d'), faint = ctx.createImageData(1, 1);
  faint.data.set([0, 0, 0, 1]); ctx.putImageData(faint, 40, 12);
  check(1, {x:40, y:12});
});

test('clearance reads every source pixel in small bands and keeps disconnected full-frame masks exact', () => {
  const [avatar, text] = masks(SIZE.width, SIZE.height), reads = {avatar:[], text:[]};
  rect(avatar, 0, 0); rect(avatar, SIZE.width - 1, SIZE.height - 1);
  rect(text, 960, 540, 10, 10);
  for (const [name, canvas] of [['avatar', avatar], ['text', text]]) {
    const ctx = canvas.getContext('2d'), original = ctx.getImageData.bind(ctx);
    ctx.getImageData = (...args) => { reads[name].push(args); return original(...args); };
  }
  assertAvatarTextClearance(avatar, text);
  assert.equal(reads.avatar.reduce((sum, [, , width, height]) => sum + width * height, 0), SIZE.width * SIZE.height);
  for (const args of [...reads.avatar, ...reads.text]) {
    const [x, y, width, height] = args;
    assert(height <= 8, 'Readbacks must never retain a whole-frame RGBA allocation.');
    assert(x >= 0 && y >= 0 && x + width <= SIZE.width && y + height <= SIZE.height);
  }
  // This colliding pixel is in the final source band, far outside the first
  // actor's region. No caller-supplied or incomplete region may hide it.
  rect(text, SIZE.width - 2, SIZE.height - 2);
  assert.throws(() => assertAvatarTextClearance(avatar, text), error => {
    assert.deepEqual(error.details.avatarPixel, {x:SIZE.width - 1, y:SIZE.height - 1});
    assert.equal(error.details.actualGap, 0);
    return true;
  });
});

test('ring rows and readback bands preserve witnesses well after the first dilation window', () => {
  const [avatar, text] = masks(140, 180);
  for (const y of [4, 78, 145]) rect(avatar, 50, y);
  rect(text, 83, 111); assertAvatarTextClearance(avatar, text);
  clear(text); rect(text, 82, 110);
  assert.throws(() => assertAvatarTextClearance(avatar, text), error => {
    assert.deepEqual(error.details.avatarPixel, {x:50, y:78});
    assert.deepEqual(error.details.textPixel, {x:82, y:110});
    assert.equal(error.details.actualGap, 31);
    return true;
  });
});

test('disconnected avatar pixels and transparent holes do not become solid bounding rectangles', () => {
  const [avatar, text] = masks(240, 160);
  rect(avatar, 0, 0, 10, 160); rect(avatar, 230, 0, 10, 160);
  rect(text, 100, 70, 30, 20);
  assertAvatarTextClearance(avatar, text);
  // A transparent hole inside a single connected ring remains usable too.
  rect(avatar, 0, 0, 240, 10); rect(avatar, 0, 150, 240, 10);
  assertAvatarTextClearance(avatar, text);
  rect(avatar, 68, 70); // Its unit square ends at 69; text begins at 100.
  assert.throws(() => assertAvatarTextClearance(avatar, text), /clearance/);
});

test('diagonal clearance is conservatively Chebyshev and gap zero still forbids overlapping pixels', () => {
  const [avatar, text] = masks(); rect(avatar, 30, 30); rect(text, 55, 55);
  assert(Math.hypot(24, 24) > 32, 'This diagonal meets Euclidean 32px, but not the conservative axis-aligned guard.');
  assert.throws(() => assertAvatarTextClearance(avatar, text), /32px clearance/);
  clear(text); rect(text, 63, 63); assertAvatarTextClearance(avatar, text);
  clear(text); rect(text, 31, 30); assertAvatarTextClearance(avatar, text, 0);
  rect(text, 30, 30); assert.throws(() => assertAvatarTextClearance(avatar, text, 0), /0px clearance/);
});

test('every nonzero alpha counts; invisible RGB and fully hidden actors or text do not collide', () => {
  const [avatar, text] = masks();
  rect(text, 30, 30);
  const ctx = avatar.getContext('2d'), pixel = ctx.createImageData(1, 1);
  pixel.data.set([255, 255, 255, 0]); ctx.putImageData(pixel, 30, 30);
  assertAvatarTextClearance(avatar, text);
  pixel.data[3] = 1; ctx.putImageData(pixel, 30, 30);
  assert.throws(() => assertAvatarTextClearance(avatar, text), /clearance/);
  clear(text); assertAvatarTextClearance(avatar, text);
  const textPixel = text.getContext('2d').createImageData(1, 1); textPixel.data.set([0, 0, 0, 1]);
  text.getContext('2d').putImageData(textPixel, 30, 30);
  assert.throws(() => assertAvatarTextClearance(avatar, text), /clearance/);
  clear(avatar); assertAvatarTextClearance(avatar, text);
});

test('sliding-window dilation agrees with an independent pairwise pixel oracle', () => {
  const width = 17, height = 13, [avatar, text] = masks(width, height);
  // Fixed arithmetic fixtures exercise boundaries and holes without randomness.
  for (let scenario = 0; scenario < 18; scenario++) {
    clear(avatar); clear(text);
    const a = [], b = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if ((x * 17 + y * 11 + scenario * 7) % 89 === 0) { a.push([x, y]); rect(avatar, x, y); }
      if ((x * 13 + y * 23 + scenario * 19) % 101 === 0) { b.push([x, y]); rect(text, x, y); }
    }
    for (const gap of [0, 1, 2, 5, 32, Number.MAX_SAFE_INTEGER]) {
      const collision = a.some(([ax, ay]) => b.some(([bx, by]) => Math.max(Math.abs(ax - bx), Math.abs(ay - by)) <= gap));
      if (collision) assert.throws(() => assertAvatarTextClearance(avatar, text, gap), /clearance/);
      else assertAvatarTextClearance(avatar, text, gap);
    }
  }
});

test('invalid clearance inputs fail before doing mask work', () => {
  const [avatar, text] = masks();
  for (const gap of [-1, 0.5, NaN, Infinity, '32', null]) assert.throws(() => assertAvatarTextClearance(avatar, text, gap), /gap/);
  for (const canvas of [null, {}, {width:0, height:1}, {width:1, height:1}, {width:1, height:1, getContext:() => null}]) {
    assert.throws(() => assertAvatarTextClearance(canvas, text));
  }
  assert.throws(() => assertAvatarTextClearance(avatar, createCanvas(1, 1)), /identical dimensions/);
  const fake = {width:180, height:100, getContext:() => ({getImageData:() => ({data:new Uint8ClampedArray(4)})})};
  assert.throws(() => assertAvatarTextClearance(fake, text), /complete RGBA/);
});
