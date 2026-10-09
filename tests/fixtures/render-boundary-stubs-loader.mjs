// Import-time stubs for rejection tests only. A regression cannot invoke native
// Canvas, fonts or ffmpeg: reaching any such boundary fails the subprocess.
import fs from 'node:fs';
const source = text => ({format: 'module', source: text, shortCircuit: true});
export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@napi-rs/canvas') return {url: 'test-stub:canvas', shortCircuit: true};
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  if (url === 'test-stub:canvas') return source(`export const createCanvas=()=>{throw Error('Native Canvas boundary reached');};export const loadImage=createCanvas;`);
  if (url === 'node:child_process') return source(`export const spawn=()=>{throw Error('Encoder boundary reached');};export const spawnSync=spawn;`);
  if (url.endsWith('/production/src/primitives.mjs')) return source(`export const prepareAssets=()=>{throw Error('Asset preparation boundary reached');};`);
  if (url.endsWith('/production/src/scenes.mjs')) {
    const timeline=JSON.parse(fs.readFileSync(new URL('../../chapters/01-four-elements/narration/timeline.json',url)));
    return source(`export const timeline=${JSON.stringify(timeline)};export const FPS=30,DURATION=timeline.duration;export const drawFrame=()=>{throw Error('Draw boundary reached');};`);
  }
  if (url.endsWith('/typography/fonts.mjs')) return source(`export const registerFonts=()=>{},canvasFont=()=>{throw Error('Font drawing boundary reached');},FONT_FAMILY='test sans',SERIF_FAMILY='test serif';`);
  return nextLoad(url, context);
}
