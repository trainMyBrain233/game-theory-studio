import assert from 'node:assert/strict';

// Parse the applied context state independently of canvasFont()'s string builder.
export function assertAppliedFont(context,{size,weight,family}) {
 const font=context.font;
 const match=/^(?:(400|700|normal|bold)\s+)?([0-9]+(?:\.[0-9]+)?)px\s+(.+)$/.exec(font);
 assert(match,`Unsupported applied canvas font: ${font}`);
 const appliedSize=Number(match[2]);
 const appliedWeight=match[1]==='bold'?700:match[1]==='normal'||!match[1]?400:Number(match[1]);
 const appliedFamily=match[3].replace(/^(['"])(.*)\1$/,'$2');
 assert.equal(appliedSize,size,`Applied canvas font size must be ${size}px: ${font}`);
 assert.equal(appliedWeight,weight,`Applied canvas font weight must be ${weight}: ${font}`);
 assert.equal(appliedFamily,family,`Applied canvas font family must be ${family}: ${font}`);
 return {size:appliedSize,weight:appliedWeight,family:appliedFamily,font};
}
