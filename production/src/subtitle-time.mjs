// SRT timestamps have millisecond precision. Quantize once, then validate the
// actual encoded windows rather than repairing them by changing narration time.
export function subtitleMilliseconds(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    throw new Error('SRT time must be finite, nonnegative and representable in integer milliseconds');
  }
  const milliseconds = Math.round(seconds * 1000);
  if (!Number.isSafeInteger(milliseconds)) {
    throw new Error('SRT time must be finite, nonnegative and representable in integer milliseconds');
  }
  return milliseconds;
}

export function subtitleStamp(milliseconds) {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) throw new Error('SRT timestamp needs nonnegative integer milliseconds');
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor(milliseconds % 3600000 / 60000);
  const seconds = Math.floor(milliseconds % 60000 / 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds % 1000).padStart(3, '0')}`;
}

export function subtitleWindows(segments) {
  let previousEnd = 0;
  return segments.map((segment, index) => {
    const start = subtitleMilliseconds(segment.start), end = subtitleMilliseconds(segment.end);
    const context = segment.id ?? `cue ${index + 1}`;
    if (end <= start) throw new Error(`${context}: SRT display window collapses after millisecond rounding (${start} --> ${end}); end must be greater than start`);
    if (start < previousEnd) throw new Error(`${context}: SRT display windows must be chronological and nonoverlapping after millisecond rounding`);
    previousEnd = end;
    return {start, end};
  });
}
