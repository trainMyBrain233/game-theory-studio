/**
 * Source-independent bitmap avatar boundary. No loader, path, clock, or cache is
 * consulted here. An adapter draws its complete native-pixel image at (0, 0).
 * alphaBounds is a nonempty, half-open integer rectangle enclosing its ink.
 * Producers must check that declaration against their actual raster artwork.
 *
 * A pose's x/y anchors the top-left of the full intrinsic image footprint.
 * side=-1 mirrors inside that footprint; it does not move the outer box.
 * Direction is fixed over a transition. All sampled values are absolute, so
 * frames can be drawn cold, repeated, or out of order on a fresh canvas.
 */
const EASINGS = Object.freeze({
  linear: t => t,
  smoothstep: t => t * t * (3 - 2 * t),
  smootherstep: t => t * t * t * (t * (t * 6 - 15) + 10),
});

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
}
function finite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`);
}
function integer(value, label, minimum = Number.MIN_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`${label} must be a safe integer >= ${minimum}.`);
  }
}
function validatePose(pose, label) {
  record(pose, label);
  for (const key of ['x', 'y', 'scale', 'alpha']) finite(pose[key], `${label}.${key}`);
  if (pose.scale <= 0) throw new RangeError(`${label}.scale must be positive.`);
  if (pose.side !== 1 && pose.side !== -1) throw new RangeError(`${label}.side must be 1 or -1.`);
  if (pose.alpha < 0 || pose.alpha > 1) throw new RangeError(`${label}.alpha must be between 0 and 1.`);
}
function copyPose(pose) {
  return Object.freeze(Object.fromEntries(['x', 'y', 'scale', 'side', 'alpha'].map(key => [key, pose[key]])));
}
function validateTrack(track) {
  record(track, 'Avatar transition');
  integer(track.startFrame, 'startFrame', 0);
  integer(track.endFrame, 'endFrame', 1);
  if (track.endFrame <= track.startFrame) throw new RangeError('endFrame must be after startFrame.');
  if (track.endFrame === Number.MAX_SAFE_INTEGER) {
    throw new RangeError('endFrame must leave room for its adjacent safe-integer frame.');
  }
  validatePose(track.from, 'from');
  validatePose(track.to, 'to');
  if (track.from.side !== track.to.side) throw new RangeError('Avatar direction must stay fixed during a transition.');
  const easing = track.easing ?? 'smoothstep';
  if (typeof easing !== 'string' || !Object.hasOwn(EASINGS, easing)) throw new RangeError('easing must be linear, smoothstep, or smootherstep.');
  return easing;
}

/** Check the public shape only; validation never loads or executes the asset. */
export function validateAvatarAdapter(adapter) {
  record(adapter, 'Avatar adapter');
  if (typeof adapter.id !== 'string' || !adapter.id.trim()) throw new TypeError('Avatar adapter id must be nonempty.');
  integer(adapter.width, 'Avatar adapter width', 1);
  integer(adapter.height, 'Avatar adapter height', 1);
  record(adapter.alphaBounds, 'Avatar adapter alphaBounds');
  const bounds = adapter.alphaBounds;
  integer(bounds.x, 'alphaBounds.x', 0);
  integer(bounds.y, 'alphaBounds.y', 0);
  integer(bounds.width, 'alphaBounds.width', 1);
  integer(bounds.height, 'alphaBounds.height', 1);
  if (bounds.x > adapter.width - bounds.width || bounds.y > adapter.height - bounds.height) {
    throw new RangeError('Avatar alphaBounds must fit inside the intrinsic image.');
  }
  if (typeof adapter.draw !== 'function') throw new TypeError('Avatar adapter draw(ctx) must be a function.');
  return adapter;
}

/** Defensive copies make endpoint poses immutable without freezing the caller. */
export function createAvatarTransition(track) {
  const easing = validateTrack(track);
  return Object.freeze({
    startFrame: track.startFrame,
    endFrame: track.endFrame,
    from: copyPose(track.from),
    to: copyPose(track.to),
    easing,
  });
}

/** Named easing is evaluated from explicit integer frame input, never history. */
export function sampleAvatarTransition(track, frame) {
  const easing = validateTrack(track);
  integer(frame, 'frame');
  const progress = Math.max(0, Math.min(1, (frame - track.startFrame) / (track.endFrame - track.startFrame)));
  const easedProgress = EASINGS[easing](progress);
  const interpolate = key => {
    if (progress === 0 || track.from[key] === track.to[key]) return track.from[key];
    if (progress === 1) return track.to[key];
    return track.from[key] * (1 - easedProgress) + track.to[key] * easedProgress;
  };
  return Object.freeze({
    frame, progress, easedProgress,
    x: interpolate('x'), y: interpolate('y'), scale: interpolate('scale'),
    side: track.from.side, alpha: interpolate('alpha'),
  });
}

/** Quarter points round to the nearest integer; duplicates on short tracks fold. */
export function avatarTransitionFrames(track) {
  validateTrack(track);
  const span = track.endFrame - track.startFrame;
  return Object.freeze([...new Set([
    track.startFrame - 1,
    ...[0, 0.25, 0.5, 0.75, 1].map(portion => track.startFrame + Math.round(span * portion)),
    track.endFrame + 1,
  ])].sort((a, b) => a - b));
}

/** Transformed declared bounds are useful for planning, not a raster proof. */
export function avatarSampleBounds(adapter, sample) {
  validateAvatarAdapter(adapter);
  validatePose(sample, 'sample');
  const bounds = adapter.alphaBounds;
  const x = sample.x + (sample.side === 1 ? bounds.x : adapter.width - bounds.x - bounds.width) * sample.scale;
  const y = sample.y + bounds.y * sample.scale;
  const width = bounds.width * sample.scale, height = bounds.height * sample.scale;
  for (const value of [x, y, width, height, x + width, y + height, adapter.width * sample.scale, adapter.height * sample.scale]) {
    if (!Number.isFinite(value)) throw new RangeError('Avatar transformed geometry must remain finite.');
  }
  return sample.alpha === 0 ? null : Object.freeze({x, y, width, height});
}

/** The adapter owns no external context state; restore also runs after errors. */
export function drawAvatarSample(ctx, adapter, sample) {
  const bounds = avatarSampleBounds(adapter, sample);
  if (!ctx || ['save', 'restore', 'translate', 'scale'].some(method => typeof ctx[method] !== 'function')) {
    throw new TypeError('drawAvatarSample requires a 2D drawing context.');
  }
  if (!Number.isFinite(ctx.globalAlpha) || ctx.globalAlpha < 0 || ctx.globalAlpha > 1) {
    throw new TypeError('Drawing context globalAlpha must be between 0 and 1.');
  }
  if (bounds === null) return null;
  ctx.save();
  try {
    ctx.translate(sample.x, sample.y);
    ctx.scale(sample.scale * sample.side, sample.scale);
    if (sample.side === -1) ctx.translate(-adapter.width, 0);
    ctx.globalAlpha *= sample.alpha;
    adapter.draw(ctx);
  } finally {
    ctx.restore();
  }
  return bounds;
}

/** Measure every nonzero alpha pixel. Empty rasters have no ink rectangle. */
export function alphaInkBounds(canvas) {
  if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('alphaInkBounds requires a canvas.');
  integer(canvas.width, 'Canvas width', 1);
  integer(canvas.height, 'Canvas height', 1);
  const {width, height} = canvas;
  const data = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] === 0) continue;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y);
    x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return x1 < 0 ? null : Object.freeze({x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1});
}
