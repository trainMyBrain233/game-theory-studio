/** Raster geometry for the fixed public bitmap harness. */
import {avatarSampleBounds, createAvatarTransition} from './avatar.mjs';

function validateSize(size, label = 'Frame') {
  if (!size || !Number.isSafeInteger(size.width) || size.width <= 0 ||
      !Number.isSafeInteger(size.height) || size.height <= 0 ||
      !Number.isSafeInteger(size.width * size.height)) {
    throw new TypeError(`${label} width and height must be positive safe integers.`);
  }
}

function filteredEdge(position, nativeOffset, scale, extent) {
  const offset = nativeOffset * scale, edge = position + offset;
  if (!Number.isFinite(edge)) throw new RangeError('Avatar filtered geometry must remain finite.');
  // The sampler computes position and scale through separate affine operations.
  // Exact edge contact can therefore become a few ulps negative (e.g. -4e-16).
  // Budget those operations at their actual magnitude, then snap ONLY outward
  // boundary errors within that budget. The sqrt(EPS) device-pixel ceiling keeps
  // ill-conditioned coordinates from turning roundoff into visible padding.
  const tolerance = Math.min(Math.sqrt(Number.EPSILON),
    8 * Number.EPSILON * Math.max(1, Math.abs(position), Math.abs(offset), extent));
  if (edge < 0 && edge >= -tolerance) return 0;
  if (edge > extent && edge <= extent + tolerance) return extent;
  return edge;
}

/**
 * alphaBounds must be the independently measured, captured source pixels, not
 * merely a provider declaration. The renderer pins smoothing to true / low:
 * bilinear interpolation can carry an edge pixel's alpha half a source pixel
 * beyond its unit-square bound. Clamp that support to the source rectangle,
 * because drawImage never draws beyond the image itself. This deliberately
 * conservative envelope also covers fractional positions and minification.
 * Higher-order filters, rotation, or arbitrary provider drawing are NOT covered.
 *
 * Transparent source padding may be outside the frame. Opacity zero does not
 * waive the geometry contract: this harness has no offscreen entrance mode.
 */
export function assertAvatarSampleInFrame(adapter, sample, size) {
  validateSize(size);
  // Reuse the adapter/pose/overflow checks, including the original alpha value.
  avatarSampleBounds(adapter, sample);
  const ink = adapter.alphaBounds;
  const left = Math.max(0, ink.x - 0.5);
  const right = Math.min(adapter.width, ink.x + ink.width + 0.5);
  const top = Math.max(0, ink.y - 0.5);
  const bottom = Math.min(adapter.height, ink.y + ink.height + 0.5);
  const x0 = filteredEdge(sample.x, sample.side === 1 ? left : adapter.width - right, sample.scale, size.width);
  const x1 = filteredEdge(sample.x, sample.side === 1 ? right : adapter.width - left, sample.scale, size.width);
  const y0 = filteredEdge(sample.y, top, sample.scale, size.height);
  const y1 = filteredEdge(sample.y, bottom, sample.scale, size.height);
  if (x0 < 0 || y0 < 0 || x1 > size.width || y1 > size.height) {
    throw new RangeError(`Avatar ${adapter.id} filtered alpha footprint must remain inside ${size.width}x${size.height}; bounds [${x0}, ${y0}, ${x1}, ${y1}].`);
  }
  return Object.freeze({x: x0, y: y0, width: x1 - x0, height: y1 - y0});
}

/**
 * For a fixed mirror side, each support edge has the form position + k*scale,
 * where k is constant. The supported sampler interpolates position and scale
 * with the SAME easing fraction q in [0,1]. Each edge is therefore the convex
 * combination (1-q)*edge(from) + q*edge(to). Checking both endpoints contains
 * the entire transition, including every integer frame, not only checkpoints.
 * Before/after frames clamp to those endpoints. Positive scale and fixed side
 * are enforced by createAvatarTransition; no extrapolating easing is admitted.
 * The actual render-point check remains useful for floating-point defensiveness.
 */
export function assertAvatarTrackInFrame(adapter, track, size) {
  const validated = createAvatarTransition(track);
  assertAvatarSampleInFrame(adapter, validated.from, size);
  assertAvatarSampleInFrame(adapter, validated.to, size);
  return validated;
}

function maskContext(canvas, label) {
  validateSize(canvas, label);
  if (typeof canvas.getContext !== 'function') throw new TypeError(`${label} must be a canvas.`);
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof ctx.getImageData !== 'function') throw new TypeError(`${label} requires a 2D context.`);
  return ctx;
}
function readPixels(ctx, x, y, width, height, label) {
  const data = ctx.getImageData(x, y, width, height)?.data;
  if (!(data instanceof Uint8ClampedArray) || data.length !== width * height * 4) {
    throw new TypeError(`${label} must provide complete RGBA pixel bytes.`);
  }
  return data;
}

/** Recover a real pixel witness only after the linear-time guard has failed. */
function clearanceError(hasInk, width, height, x, y, gap, rx, ry) {
  let actualGap = Infinity, avatarPixel;
  for (let ay = Math.max(0, y - ry); ay <= Math.min(height - 1, y + ry); ay++) {
    for (let ax = Math.max(0, x - rx); ax <= Math.min(width - 1, x + rx); ax++) {
      if (!hasInk(ax, ay)) continue;
      const distance = Math.max(Math.abs(ax - x) - 1, Math.abs(ay - y) - 1, 0);
      if (distance < actualGap) { actualGap = distance; avatarPixel = {x:ax, y:ay}; }
    }
  }
  // The dilation already established a witness in this same pixel window.
  const details = Object.freeze({
    textPixel:Object.freeze({x, y}), avatarPixel:Object.freeze(avatarPixel),
    actualGap, requiredGap:gap, metric:'chebyshev_pixel_gap',
  });
  const error = new RangeError(`Avatar lacks ${gap}px clearance from visible text ink at (${x}, ${y}); actual pixel gap ${actualGap}px.`);
  Object.defineProperty(error, 'details', {value:details, enumerable:true});
  return error;
}

/**
 * Require an empty gap between every visible avatar pixel and every visible
 * text pixel. Use the complete rendered masks, without role/name filtering or
 * joining disconnected actors into one bounding rectangle. Even alpha=1 counts.
 *
 * Two pixels whose integer coordinates differ by 33 on one axis have 32 empty
 * pixels between their unit squares. Consequently radius=gap dilation rejects
 * 31px and accepts exactly 32px clearance. This Chebyshev criterion is stricter
 * than Euclidean distance at diagonals. gap=0 still disallows overlapping ink.
 * Separable sliding windows bound work and scratch space by O(width*height),
 * independent of actor count, text roles, visible pixel count, or requested gap.
 * Eight-row readbacks, a one-bit source mask, and a sliding ring avoid retaining
 * full-frame RGBA buffers. At 1920x1080 / gap 32 the live scratch is <0.6 MiB.
 */
export function assertAvatarTextClearance(avatarMask, textMask, gap = 32) {
  if (!Number.isSafeInteger(gap) || gap < 0) throw new TypeError('Avatar text clearance gap must be a nonnegative safe integer.');
  validateSize(avatarMask, 'Avatar mask');
  validateSize(textMask, 'Text mask');
  if (avatarMask.width !== textMask.width || avatarMask.height !== textMask.height) {
    throw new RangeError('Avatar and text masks must have identical dimensions.');
  }
  const avatarContext = maskContext(avatarMask, 'Avatar mask'), textContext = maskContext(textMask, 'Text mask');
  const {width, height} = avatarMask;
  const rx = Math.min(gap, width - 1), ry = Math.min(gap, height - 1);
  const bandRows = 8, bits = new Uint32Array(Math.ceil(width * height / 32));
  let inkX0 = width, inkX1 = -1, inkY0 = height, inkY1 = -1;
  for (let top = 0; top < height; top += bandRows) {
    const rows = Math.min(bandRows, height - top);
    const bytes = readPixels(avatarContext, 0, top, width, rows, 'Avatar mask');
    for (let row = 0; row < rows; row++) for (let x = 0; x < width; x++) {
      if (bytes[(row * width + x) * 4 + 3] === 0) continue;
      const y = top + row, index = y * width + x;
      bits[Math.floor(index / 32)] |= 1 << (index % 32);
      inkX0 = Math.min(inkX0, x); inkX1 = Math.max(inkX1, x);
      inkY0 = Math.min(inkY0, y); inkY1 = Math.max(inkY1, y);
    }
  }
  // Validate even an unused text readback; empty avatar masks cannot collide.
  readPixels(textContext, 0, 0, 1, 1, 'Text mask');
  if (inkX1 < 0) return;
  const hasInk = (x, y) => {
    const index = y * width + x;
    return (bits[Math.floor(index / 32)] & (1 << (index % 32))) !== 0;
  };
  // This candidate region comes ONLY from the complete measured mask above.
  // Outside it, no avatar pixel can be within gap. Inside it, the exact mask
  // still decides collision; transparent holes/disconnected actors stay empty.
  const x0 = Math.max(0, inkX0 - rx), x1 = Math.min(width - 1, inkX1 + rx);
  const y0 = Math.max(0, inkY0 - ry), y1 = Math.min(height - 1, inkY1 + ry);
  const columnsCount = x1 - x0 + 1, ringRows = Math.min(height, ry * 2 + 1);
  const ring = new Uint8Array(columnsCount * ringRows), columns = new Float64Array(columnsCount);
  const addRow = y => {
    const slot = (y % ringRows) * columnsCount;
    let count = 0;
    for (let x = Math.max(0, x0 - rx); x <= Math.min(width - 1, x0 + rx); x++) count += hasInk(x, y);
    for (let local = 0; local < columnsCount; local++) {
      const x = x0 + local;
      ring[slot + local] = count !== 0;
      columns[local] += ring[slot + local];
      if (x >= rx) count -= hasInk(x - rx, y);
      if (x + rx + 1 < width) count += hasInk(x + rx + 1, y);
    }
  };
  for (let y = Math.max(0, y0 - ry); y <= Math.min(height - 1, y0 + ry); y++) addRow(y);
  for (let top = y0; top <= y1; top += bandRows) {
    const rows = Math.min(bandRows, y1 - top + 1);
    const text = readPixels(textContext, x0, top, columnsCount, rows, 'Text mask');
    for (let row = 0; row < rows; row++) {
      const y = top + row;
      for (let local = 0; local < columnsCount; local++) {
        if (columns[local] !== 0 && text[(row * columnsCount + local) * 4 + 3] !== 0) {
          throw clearanceError(hasInk, width, height, x0 + local, y, gap, rx, ry);
        }
      }
      if (y >= ry) {
        const slot = ((y - ry) % ringRows) * columnsCount;
        for (let local = 0; local < columnsCount; local++) columns[local] -= ring[slot + local];
      }
      if (y + ry + 1 < height) addRow(y + ry + 1);
    }
  }
}
