import assert from 'node:assert/strict';

// Independent reference geometry for the existing three static templates.
const matrix = {editorial: [976,421,353,184], textbook: [382,496,332,159], bright: [316,444,310,181]};
function rgba(hex) { return [...hex.slice(1).match(/../g).map(value => parseInt(value,16)),255]; }
export function verifySelection(canvas, boxes, style, data, selected, palette) {
  const [x,y,w,h] = matrix[style];
  const ctx = canvas.getContext('2d');
  for (let row=0; row<2; row++) for (let column=0; column<2; column++) {
    const actual = [...ctx.getImageData(x+column*w+28,y+row*h+28,1,1).data];
    const target = row===selected.row && column===selected.column;
    assert.deepEqual(actual,rgba(target?palette.wash:palette.paper),`Wrong highlighted cell ${style}/${row}/${column}`);
    if (target && style !== 'bright') assert.deepEqual([...ctx.getImageData(x+column*w+80,y+row*h,1,1).data],rgba(palette.accent),'Selected border must use the accent');
  }
  const [a,b] = data.payoffs[selected.row][selected.column];
  const [playerA,playerB] = data.actors.map(actor=>actor.label);
  const [strategyA,strategyB] = [data.strategies[selected.row].label,data.strategies[selected.column].label];
  const texts = boxes.map(box=>box.text);
  if(style==='textbook') {
    assert(texts.includes(`${playerA}选${strategyA} → 找到${strategyA}行`));
    assert(texts.includes(`${playerB}选${strategyB} → 找到${strategyB}列`));
    assert(texts.includes(`交叉这一格 → (${a}, ${b})`));
    assert(texts.includes(`${playerA} ${a}分   ${playerB} ${b}分`));
  } else if(style==='editorial') assert(texts.includes(`${a} 分，${b} 分`));
  else {
    assert(texts.includes(`${playerA} · ${a}分`)); assert(texts.includes(`${playerB} · ${b}分`));
    assert(texts.includes(strategyA) && texts.includes(strategyB));
  }
  assert(texts.includes(`每格顺序：（${playerA}，${playerB}）`));
}
