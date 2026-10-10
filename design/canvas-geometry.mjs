/** The fixed proposal layout supports only uniformly scaled 16:9 canvases. */
export function proposalScale(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width * 9 !== height * 16) {
    throw Error('Proposal canvas must have positive integer dimensions and a 16:9 aspect ratio.');
  }
  return width / 1920;
}
