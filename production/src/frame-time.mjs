// For finite positive exclusive timeline ends, the preceding Float64 stays
// inside even a one-ULP segment. Unlike a fixed frame/epsilon subtraction, it
// cannot jump over a short tail. Shared by checkpoints and endpoint rendering.
export function beforeEnd(end) {
 if(!Number.isFinite(end)||end<=0)throw Error('Exclusive frame end must be finite and positive.');
 const bits=new DataView(new ArrayBuffer(8));
 bits.setFloat64(0,end);
 bits.setBigUint64(0,bits.getBigUint64(0)-1n);
 return bits.getFloat64(0);
}
