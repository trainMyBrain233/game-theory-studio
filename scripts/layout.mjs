import assert from 'node:assert/strict';

export function overlaps(a, b, gap = 0) {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}
export function checkTextLayout(boxes, width, height, {collisions = false} = {}) {
  for (const box of boxes) {
    assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height, `Text outside canvas: ${box.text}`);
  }
  if (collisions) for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [a, b] = [boxes[i], boxes[j]];
    // The historical editorial A badge draws its reverse glyph at the same position.
    const sameBadge = a.text === 'A' && b.text === 'A' && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
    assert(sameBadge || !overlaps(a, b), `Text collision: ${a.text} / ${b.text}`);
  }
  return boxes;
}
