// Original programmatic fixtures prove the public adapter contract only. They
// do not establish production-character, full-video, encoding, or audio validity.
import '../scripts/isolated-fonts.mjs';
import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas as nativeCreateCanvas} from '@napi-rs/canvas';
const allocatedSurfaces=[];
const createCanvas=(...args)=>{const surface=nativeCreateCanvas(...args);allocatedSurfaces.push(surface);return surface;};
afterEach(()=>{for(const surface of allocatedSurfaces){surface.width=1;surface.height=1;}allocatedSurfaces.length=0;});
import {canvasFont, registerFonts, FONT_FAMILY} from '../typography/fonts.mjs';
import {assertAppliedFont} from '../typography/font-contract.mjs';
import {
  validateAvatarAdapter, createAvatarTransition, sampleAvatarTransition,
  avatarTransitionFrames, avatarSampleBounds, drawAvatarSample, alphaInkBounds,
} from '../production/src/animatic/avatar.mjs';
import {assertAvatarTrackInFrame, assertAvatarSampleInFrame} from '../production/src/animatic/geometry.mjs';

registerFonts();
const SIZE = {width: 1920, height: 1080};
const pose = (overrides = {}) => ({x: 160, y: 220, scale: 1, side: 1, alpha: 1, ...overrides});
const track = (overrides = {}) => createAvatarTransition({
  startFrame: 12, endFrame: 52,
  from: pose({x: 120, y: 260, scale: 1.8, alpha: 0.25}),
  to: pose({x: 240, y: 340, scale: 2.4}), ...overrides,
});

/** Two asymmetric, transparent pixel-art toy heads drawn only from original code. */
function syntheticHead(kind = 'amber') {
  const canvas = createCanvas(96, 104), ctx = canvas.getContext('2d');
  if (kind === 'amber') {
    ctx.fillStyle = '#d8a247';
    for (const rect of [[24,18,42,62], [15,37,14,19], [61,28,18,33], [28,9,11,13], [39,14,21,11], [32,80,27,12]]) ctx.fillRect(...rect);
    ctx.fillStyle = '#163a56';
    ctx.fillRect(32,39,7,11); ctx.fillRect(50,35,10,8); ctx.fillRect(42,64,17,5);
  } else if (kind === 'teal') {
    ctx.fillStyle = '#4c9b9d';
    for (const rect of [[21,27,49,49], [10,31,16,14], [65,49,16,19], [58,14,8,20], [25,72,34,16]]) ctx.fillRect(...rect);
    ctx.fillStyle = '#163a56';
    ctx.fillRect(30,40,10,6); ctx.fillRect(54,44,6,10); ctx.fillRect(36,64,14,5);
  } else throw Error('Unknown synthetic head.');
  const expected = kind === 'amber' ? {x:15,y:9,width:64,height:83} : {x:10,y:14,width:71,height:74};
  assert.deepEqual(alphaInkBounds(canvas), expected, 'raster must match independently specified native bounds');
  const adapter = Object.freeze({
    id: `synthetic-${kind}`, width: canvas.width, height: canvas.height,
    alphaBounds: Object.freeze(expected), draw(target) { target.drawImage(canvas, 0, 0); },
  });
  validateAvatarAdapter(adapter);
  return {canvas, adapter};
}

function raster(adapter, sample, target = createCanvas(SIZE.width, SIZE.height)) {
  const ctx = target.getContext('2d');
  ctx.clearRect(0, 0, target.width, target.height);
  drawAvatarSample(ctx, adapter, sample);
  return target;
}
function digest(canvas) {
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  return createHash('sha256').update(pixels).digest('hex');
}

/** Actual alpha runs, not font metrics or adapter declarations. */
function inkMask(canvas) {
  const bounds = alphaInkBounds(canvas);
  assert.ok(bounds, 'A tested visible mask must have nonempty ink.');
  const data = canvas.getContext('2d').getImageData(bounds.x, bounds.y, bounds.width, bounds.height).data;
  const rows = [];
  for (let y = 0; y < bounds.height; y++) {
    const spans = [];
    for (let x = 0; x < bounds.width;) {
      if (data[(y * bounds.width + x) * 4 + 3] === 0) { x++; continue; }
      const start = x++;
      while (x < bounds.width && data[(y * bounds.width + x) * 4 + 3] !== 0) x++;
      spans.push([start + bounds.x, x + bounds.x]);
    }
    if (spans.length) rows.push({y: y + bounds.y, spans});
  }
  return {bounds, rows};
}

/** Exact minimum distance between unit-square nonzero-alpha pixels. */
function horizontalGap(a, b) {
  if (a.at(-1)[1] <= b[0][0]) return b[0][0] - a.at(-1)[1];
  if (b.at(-1)[1] <= a[0][0]) return a[0][0] - b.at(-1)[1];
  let i = 0, j = 0, nearest = Infinity;
  while (i < a.length && j < b.length) {
    const [a0,a1] = a[i], [b0,b1] = b[j];
    nearest = Math.min(nearest, Math.max(0,b0-a1,a0-b1));
    if (nearest === 0) return 0;
    if (a1 < b1) i++; else j++;
  }
  return nearest;
}
function inkGap(a, b) {
  let nearestSquared = Infinity;
  const minimumDx = Math.max(0,b.bounds.x-a.bounds.x-a.bounds.width,a.bounds.x-b.bounds.x-b.bounds.width);
  for (const rowA of a.rows) for (const rowB of b.rows) {
    const dy = Math.max(0, Math.abs(rowA.y - rowB.y) - 1);
    if (dy * dy + minimumDx * minimumDx >= nearestSquared) continue;
    const dx = horizontalGap(rowA.spans, rowB.spans);
    nearestSquared = Math.min(nearestSquared, dx * dx + dy * dy);
    if (nearestSquared === 0) return 0;
  }
  return Math.sqrt(nearestSquared);
}
function visibleTextMasks() {
  return [
    {role: 'header', text: '公开示例：方向与间距', x: 80, baseline: 130, size: 48, weight: 700},
    {role: 'subtitle', text: '每一帧都保留文字阅读空间。', x: 650, baseline: 1010, size: 40, weight: 400},
    {role: 'name', text: '示例甲', x: 270, baseline: 750, size: 36, weight: 700},
    {role: 'name', text: '示例乙', x: 1450, baseline: 750, size: 36, weight: 700},
    {role: 'body', text: '移动、缩放与镜像\n保持可验证', x: 750, baseline: 430, size: 36, weight: 400},
  ].map(spec => {
    const canvas = createCanvas(SIZE.width, SIZE.height), ctx = canvas.getContext('2d');
    ctx.font = canvasFont(spec.size, spec.weight);
    assertAppliedFont(ctx, {size: spec.size, weight: spec.weight, family: FONT_FAMILY});
    ctx.fillStyle = '#163a56'; ctx.textBaseline = 'alphabetic';
    spec.text.split('\n').forEach((line, i) => ctx.fillText(line, spec.x, spec.baseline + i * 52));
    return {...spec, mask: inkMask(canvas)};
  });
}

test('public adapter validates nonempty in-image native bounds without executing draw', () => {
  let drawn = false;
  const adapter = {id: 'valid', width: 12, height: 14, alphaBounds: {x:2,y:3,width:4,height:5}, draw() { drawn = true; }};
  assert.equal(validateAvatarAdapter(adapter), adapter); assert.equal(drawn, false);
  const mutations = [
    null, [], {...adapter,id:''}, {...adapter,id:'  '}, {...adapter,id:4},
    {...adapter,width:0}, {...adapter,height:1.5}, {...adapter,width:Infinity},
    {...adapter,draw:null}, {...adapter,alphaBounds:null},
    ...[{x:-1}, {y:-1}, {x:0.5}, {width:0}, {height:0}, {width:NaN}, {x:10}, {y:13}, {width:Number.MAX_SAFE_INTEGER}]
      .map(change => ({...adapter,alphaBounds:{...adapter.alphaBounds,...change}})),
  ];
  for (const invalid of mutations) assert.throws(() => validateAvatarAdapter(invalid));
});

test('native fixture bounds measure real transparent, asymmetric alpha ink', () => {
  for (const kind of ['amber', 'teal']) {
    const {canvas, adapter} = syntheticHead(kind);
    const native = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    assert.equal(native[3], 0, 'outer padding is transparent');
    assert.ok(adapter.alphaBounds.width < adapter.width);
    const normal = raster(adapter, pose({x:0,y:0}));
    const mirrored = raster(adapter, pose({x:0,y:0,side:-1}));
    assert.notEqual(digest(normal), digest(mirrored), 'asymmetry must make direction observable');
  }
  assert.equal(alphaInkBounds(createCanvas(5, 5)), null);
  const faint = createCanvas(5, 5), ctx = faint.getContext('2d'), pixel = ctx.createImageData(1, 1);
  pixel.data.set([0,0,0,1]); ctx.putImageData(pixel, 2, 3);
  assert.deepEqual(alphaInkBounds(faint), {x:2,y:3,width:1,height:1}, 'even the faintest alpha is ink');
  assert.throws(() => alphaInkBounds(null));
});

test('immutable transition endpoints and exact before/start/quarter/end/after state', () => {
  const input = {startFrame:12,endFrame:52,from:pose(),to:pose({x:560,y:420,scale:3,alpha:0.25}),easing:'linear'};
  const original = structuredClone(input), transition = createAvatarTransition(input);
  assert.deepEqual(input, original);
  assert.ok(Object.isFrozen(transition)); assert.ok(Object.isFrozen(transition.from)); assert.ok(Object.isFrozen(transition.to));
  input.from.x = -100;
  assert.equal(transition.from.x, 160, 'defensive copy keeps mutable caller input separate');
  assert.throws(() => { transition.from.x = 42; }, TypeError);
  assert.deepEqual(avatarTransitionFrames(transition), [11,12,22,32,42,52,53]);
  for (const [frame,p] of [[11,0],[12,0],[22,0.25],[32,0.5],[42,0.75],[52,1],[53,1]]) {
    const sample = sampleAvatarTransition(transition, frame);
    assert.deepEqual(sample, {frame,progress:p,easedProgress:p,x:160+400*p,y:220+200*p,scale:1+2*p,side:1,alpha:1-0.75*p});
    assert.ok(Object.isFrozen(sample));
  }
  assert.deepEqual(avatarTransitionFrames(track({startFrame:0,endFrame:1})), [-1,0,1,2]);
  assert.deepEqual(avatarTransitionFrames(track({startFrame:0,endFrame:5})), [-1,0,1,3,4,5,6]);
});

test('named easing samples explicit frame fractions with fixed mirrored direction', () => {
  const expected = {
    linear: [0,0.25,0.5,0.75,1], smoothstep: [0,0.15625,0.5,0.84375,1],
    smootherstep: [0,0.103515625,0.5,0.896484375,1],
  };
  for (const [easing, values] of Object.entries(expected)) {
    const transition = track({easing,from:pose({side:-1}),to:pose({side:-1,x:560})});
    for (const [index, frame] of [12,22,32,42,52].entries()) {
      const sample = sampleAvatarTransition(transition, frame);
      assert.equal(sample.easedProgress, values[index]); assert.equal(sample.x, 160+400*values[index]); assert.equal(sample.side, -1);
    }
  }
  assert.equal(sampleAvatarTransition(track(), -1).progress, 0);
  assert.equal(sampleAvatarTransition(track(), Number.MAX_SAFE_INTEGER).progress, 1);
});

test('invalid transitions, changing direction, and non-integer frame inputs fail early', () => {
  const valid = track();
  const changes = [
    {startFrame:-1}, {startFrame:0.1}, {endFrame:Infinity}, {endFrame:Number.MAX_SAFE_INTEGER},
    {endFrame:12}, {endFrame:11}, {easing:'bounce'}, {easing:() => 1}, {easing:{toString:() => 'linear'}},
    {from:null}, {to:[]},
    ...[{x:NaN},{y:Infinity},{scale:0},{scale:-1},{side:0},{side:-1},{alpha:-0.1},{alpha:1.1},{alpha:undefined}]
      .map(change => ({from:{...valid.from,...change}})),
  ];
  for (const change of changes) {
    assert.throws(() => createAvatarTransition({...valid,...change}));
    assert.throws(() => sampleAvatarTransition({...valid,...change}, 20));
    assert.throws(() => avatarTransitionFrames({...valid,...change}));
  }
  for (const frame of [NaN,Infinity,-Infinity,0.5,'12',null,undefined,Number.MAX_SAFE_INTEGER+1]) {
    assert.throws(() => sampleAvatarTransition(valid, frame), /frame.*safe integer/);
  }
});

// These contract regressions use no raster allocation or provider execution.
const contractAdapter = {
  id: 'plain-data-contract', width: 12, height: 14,
  alphaBounds: {x:2, y:3, width:4, height:5},
  draw() { assert.fail('Pure contract validation must not execute the provider.'); },
};
function assertInvalidPlainTransition(input, expected) {
  for (const validate of [
    () => createAvatarTransition(input),
    () => sampleAvatarTransition(input, 32),
    () => avatarTransitionFrames(input),
    () => assertAvatarTrackInFrame(contractAdapter, input, SIZE),
  ]) assert.throws(validate, expected);
}

test('plain-data transition contract rejects every unsupported track and endpoint property', () => {
  for (const location of ['track', 'from', 'to']) {
    for (const [key, value] of [['rotation', Math.PI / 4], ['anchor', 'center'], ['extra', true], ['easnig', 'linear'], ['constructor', 'extra'], ['__proto__', {rotation:0.5}]]) {
      const input = structuredClone(track()), target = location === 'track' ? input : input[location];
      Object.defineProperty(target, key, {value, enumerable:true});
      assertInvalidPlainTransition(input, new RegExp(`unsupported property ${key}`));
    }
  }
  for (const endpoint of ['from', 'to']) for (const key of ['frame', 'progress', 'easedProgress']) {
    const input = structuredClone(track()); input[endpoint][key] = 0;
    assertInvalidPlainTransition(input, new RegExp(`unsupported property ${key}`));
  }
});

test('plain-data transition contract rejects inherited fields and nonplain records', () => {
  for (const location of ['track', 'from', 'to']) {
    for (const prototype of [{rotation:0.5}, {anchor:'center'}, {extra:true}, Date.prototype]) {
      const input = structuredClone(track()), target = location === 'track' ? input : input[location];
      Object.setPrototypeOf(target, prototype);
      assertInvalidPlainTransition(input, /must be a plain object/);
    }
    const input = structuredClone(track()), target = location === 'track' ? input : input[location];
    const inherited = Object.create(target);
    assertInvalidPlainTransition(location === 'track' ? inherited : {...input, [location]:inherited}, /must be a plain object/);
    for (const key of location === 'track' ? ['startFrame', 'endFrame', 'from', 'to'] : ['x', 'y', 'scale', 'side', 'alpha']) {
      const missing = structuredClone(input), record = location === 'track' ? missing : missing[location];
      delete record[key];
      assertInvalidPlainTransition(missing, new RegExp(`${key} must be an own data property`));
    }
  }
});

test('plain-data transition contract rejects hidden, symbol, and accessor properties without reading getters', () => {
  let getterReads = 0;
  for (const location of ['track', 'from', 'to']) {
    const supported = location === 'track' ? ['startFrame', 'endFrame', 'from', 'to', 'easing'] : ['x', 'y', 'scale', 'side', 'alpha'];
    for (const key of ['rotation', 'anchor', Symbol('extra'), ...supported]) {
      for (const descriptor of [
        {value:1, enumerable:false},
        {get() { getterReads++; throw Error('Getter must not execute.'); }, enumerable:true},
      ]) {
        const input = structuredClone(track()), target = location === 'track' ? input : input[location];
        Object.defineProperty(target, key, descriptor);
        assertInvalidPlainTransition(input, /unsupported property|must be an enumerable data property/);
      }
    }
  }
  assert.equal(getterReads, 0);
});

test('plain-data transition contract preserves supported defaults and null-prototype immutable copies', () => {
  for (const easing of [undefined, null, 'linear', 'smoothstep', 'smootherstep']) {
    const input = {startFrame:12, endFrame:52, from:pose(), to:pose({x:560}), easing};
    if (easing === undefined) delete input.easing;
    for (const nullPrototype of [false, true]) {
      const candidate = structuredClone(input);
      if (nullPrototype) for (const record of [candidate, candidate.from, candidate.to]) Object.setPrototypeOf(record, null);
      const transition = createAvatarTransition(candidate), expectedEasing = easing ?? 'smoothstep';
      assert.equal(transition.easing, expectedEasing);
      assert.equal(sampleAvatarTransition(transition, 22).easedProgress,
        {linear:0.25, smoothstep:0.15625, smootherstep:0.103515625}[expectedEasing]);
      assert.deepEqual(transition.from, pose()); assert.deepEqual(transition.to, pose({x:560}));
      for (const record of [transition, transition.from, transition.to]) assert.ok(Object.isFrozen(record));
      candidate.from.x = -100;
      assert.equal(transition.from.x, 160); assert.equal(Object.isFrozen(candidate.from), false);
    }
  }
  assert.equal(track({easing:undefined}).easing, 'smoothstep', 'An explicit undefined easing keeps its existing default.');
});

test('plain-data samples retain declared metadata through real geometry and drawing entrypoints', () => {
  let draws = 0;
  const adapter = {...contractAdapter, draw() { draws++; }};
  const ctx = {globalAlpha:0.5, save() { this.savedAlpha = this.globalAlpha; }, restore() { this.globalAlpha = this.savedAlpha; }, translate() {}, scale() {}};
  for (const side of [1, -1]) {
    const transition = track({from:pose({side}), to:pose({side, x:560})});
    assertAvatarTrackInFrame(adapter, transition, SIZE);
    for (const frame of avatarTransitionFrames(transition)) {
      const sample = sampleAvatarTransition(transition, frame);
      assert.deepEqual(Object.keys(sample).sort(), ['alpha', 'easedProgress', 'frame', 'progress', 'scale', 'side', 'x', 'y']);
      const expected = {x:sample.x + (side === 1 ? 2 : 6), y:sample.y + 3, width:4, height:5};
      assert.deepEqual(avatarSampleBounds(adapter, sample), expected);
      assertAvatarSampleInFrame(adapter, sample, SIZE);
      assert.deepEqual(drawAvatarSample(ctx, adapter, sample), expected);
      assert.equal(ctx.globalAlpha, 0.5);
    }
  }
  assert.equal(draws, 14);
  for (const [key, value] of [['rotation', 0.5], ['anchor', 'center'], ['extra', true], [Symbol('extra'), true]]) {
    const sample = {...sampleAvatarTransition(track(), 32), [key]:value};
    assert.throws(() => avatarSampleBounds(adapter, sample), /unsupported property/);
    assert.throws(() => assertAvatarSampleInFrame(adapter, sample, SIZE), /unsupported property/);
    assert.throws(() => drawAvatarSample(ctx, adapter, sample), /unsupported property/);
  }
  assert.equal(draws, 14, 'Unsupported sample fields fail before drawing.');
});

test('mirror and scaling preserve intrinsic footprint but move asymmetric ink correctly', () => {
  const {adapter} = syntheticHead();
  for (const side of [1,-1]) for (const scale of [1,2,3]) {
    const sample = pose({x:500,y:240,side,scale}), canvas = createCanvas(SIZE.width,SIZE.height);
    canvas.getContext('2d').imageSmoothingEnabled = false;
    drawAvatarSample(canvas.getContext('2d'), adapter, sample);
    // Hand-specified source extents: x=[15,79), y=[9,92), full width=96.
    const expected = {x:500+(side===1?15:17)*scale,y:240+9*scale,width:64*scale,height:83*scale};
    assert.deepEqual(alphaInkBounds(canvas), expected);
    assert.deepEqual(avatarSampleBounds(adapter, sample), expected);
  }
  assert.throws(() => avatarSampleBounds(adapter, pose({scale:Number.MAX_VALUE})), /finite/);
});

test('drawing composes alpha and restores transform, opacity and paint, including errors', () => {
  const {adapter} = syntheticHead(), canvas = createCanvas(300,300), ctx = canvas.getContext('2d');
  ctx.globalAlpha = 0.5; ctx.fillStyle = '#abcdef'; ctx.translate(7,9);
  const before = {transform:ctx.getTransform(),alpha:ctx.globalAlpha,fill:ctx.fillStyle};
  drawAvatarSample(ctx, adapter, pose({x:0,y:0,alpha:0.5}));
  assert.deepEqual(ctx.getTransform(), before.transform); assert.equal(ctx.globalAlpha,before.alpha); assert.equal(ctx.fillStyle,before.fill);
  const alpha = ctx.getImageData(7+30,9+30,1,1).data[3];
  assert.ok(alpha>=63 && alpha<=64, 'parent alpha and sample alpha multiply in raster pixels');
  const broken = {...adapter,draw(context) { context.translate(30,40); context.globalAlpha=0.1; context.fillStyle='red'; throw Error('synthetic draw failure'); }};
  assert.throws(() => drawAvatarSample(ctx, broken, pose()), /synthetic draw failure/);
  assert.deepEqual(ctx.getTransform(), before.transform); assert.equal(ctx.globalAlpha,before.alpha);
  // The pinned backend caches a stale fillStyle getter after restore; actual
  // painted pixels independently prove the restored paint instead.
  ctx.fillRect(100,100,1,1);
  const restoredPixel = [...ctx.getImageData(107,109,1,1).data];
  assert.deepEqual(restoredPixel.slice(0,3), [171,205,239]);
  assert.ok(restoredPixel[3]>=127 && restoredPixel[3]<=128);
  assert.equal(drawAvatarSample(ctx, broken, pose({alpha:0})), null, 'invisible adapter is not executed');
  assert.throws(() => drawAvatarSample({}, adapter, pose()), /drawing context/);
});

test('raster pixels are identical cold, warm, repeated, and in unrelated frame order', () => {
  for (const [kind,side] of [['amber',1],['teal',-1]]) {
    const transition = track({from:pose({side,x:300,scale:1.2,alpha:0.2}),to:pose({side,x:500,y:330,scale:2.3})});
    const frames = avatarTransitionFrames(transition), {adapter} = syntheticHead(kind);
    const cold = new Map(frames.map(frame => [frame,digest(raster(syntheticHead(kind).adapter,sampleAvatarTransition(transition,frame)))]));
    const warmCanvas = createCanvas(SIZE.width,SIZE.height);
    for (const frame of [...frames].reverse().concat([32,12,53,22,42,11,52],frames,frames)) {
      const sample = sampleAvatarTransition(transition,frame);
      assert.equal(digest(raster(adapter,sample,warmCanvas)),cold.get(frame),`${kind} frame ${frame}`);
    }
    assert.notEqual(cold.get(12),cold.get(32),'test must actually exercise movement');
    assert.notEqual(cold.get(32),cold.get(52),'test must actually exercise the whole transition');
  }
});

test('every transition frame has at least 32px actual alpha-ink gap to every visible text role', () => {
  const texts = visibleTextMasks();
  assert.deepEqual(new Set(texts.map(text=>text.role)),new Set(['header','subtitle','name','body']));
  const actors = [
    {adapter:syntheticHead('amber').adapter,transition:track()},
    {adapter:syntheticHead('teal').adapter,transition:track({from:pose({x:1510,y:290,scale:2.5,side:-1,alpha:0.3}),to:pose({x:1430,y:260,scale:2,side:-1})})},
  ];
  for (const {adapter,transition} of actors) {
    const tested = new Set(), canvas = createCanvas(SIZE.width,SIZE.height);
    for (let frame=transition.startFrame-1;frame<=transition.endFrame+1;frame++) {
      const ink = inkMask(raster(adapter,sampleAvatarTransition(transition,frame),canvas)); tested.add(frame);
      for (const {role,text,mask} of texts) {
        const gap=inkGap(ink,mask);
        assert.ok(gap>=32,`${adapter.id}, ${role} ${text}, frame ${frame}: actual ink gap ${gap}px < 32px`);
      }
    }
    for (const frame of avatarTransitionFrames(transition)) assert.ok(tested.has(frame));
  }
});

test('moving-collision negatives pass endpoints but fail actual ink clearance for all text roles', () => {
  const {adapter} = syntheticHead(), canvas = createCanvas(SIZE.width,SIZE.height);
  for (const {role,mask} of visibleTextMasks()) {
    const {x,y,width} = mask.bounds;
    const transition = track({startFrame:0,endFrame:20,easing:'linear',
      from:pose({x:x-adapter.alphaBounds.x-adapter.alphaBounds.width-33,y:y-20}),
      to:pose({x:x+width+33-adapter.alphaBounds.x,y:y-20})});
    for (const frame of [0,20]) {
      assert.ok(inkGap(inkMask(raster(adapter,sampleAvatarTransition(transition,frame),canvas)),mask)>=32,`${role}: endpoint should be clear`);
    }
    const middleGap=inkGap(inkMask(raster(adapter,sampleAvatarTransition(transition,10),canvas)),mask);
    assert.ok(middleGap<32,`${role}: a moving collision must fail despite clear endpoints`);
  }
});

test('the alpha-gap oracle distinguishes 31px from exactly 32px and ignores transparent padding', () => {
  const a=createCanvas(250,100), b=createCanvas(250,100);
  a.getContext('2d').fillRect(10,20,20,20);
  b.getContext('2d').fillRect(62,20,20,20);
  assert.equal(inkGap(inkMask(a),inkMask(b)),32);
  b.getContext('2d').clearRect(0,0,250,100); b.getContext('2d').fillRect(61,20,20,20);
  assert.equal(inkGap(inkMask(a),inkMask(b)),31);
});
