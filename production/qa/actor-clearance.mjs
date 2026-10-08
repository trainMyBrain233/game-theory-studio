/** Measure visible RGBA artwork against measured text, in 1080p canvas units. */
export function actorTextClearance(mask,record,spacing,{alphaThreshold=40}={}){
 const minimum=record.role==='actor-name'?spacing.figure_name_gap:spacing.graphic_text_gap_target;
 if(!Number.isFinite(minimum)||minimum<0)throw Error('Missing actor/text clearance contract.');
 const x0=Math.max(0,Math.floor(record.x-minimum)),y0=Math.max(0,Math.floor(record.y-minimum));
 const width=Math.min(mask.width-x0,Math.ceil(record.x+record.width+minimum)-x0),height=Math.min(mask.height-y0,Math.ceil(record.y+record.height+minimum)-y0);
 if(width<=0||height<=0)return {minimum,pixels:0,nearestDistance:null};
 const data=mask.getContext('2d').getImageData(x0,y0,width,height).data;
 let pixels=0,nearestDistance=Infinity;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  if(data[(y*width+x)*4+3]<=alphaThreshold)continue;
  const px=x0+x,py=y0+y;
  const distance=Math.hypot(Math.max(record.x-px,0,px-record.x-record.width),Math.max(record.y-py,0,py-record.y-record.height));
  if(distance<minimum){pixels++;nearestDistance=Math.min(nearestDistance,distance);}
 }
 return {minimum,pixels,nearestDistance:Number.isFinite(nearestDistance)?nearestDistance:null};
}
