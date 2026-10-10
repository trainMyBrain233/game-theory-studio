import {createCanvas} from '@napi-rs/canvas';
/** Measure the actual supplied head layer, including hats. No face regeneration. */
export function headAlphaBounds(image){
 const canvas=createCanvas(image.width,image.height),c=canvas.getContext('2d');c.drawImage(image,0,0);
 const rgba=c.getImageData(0,0,image.width,image.height).data;
 let left=image.width,top=image.height,right=-1,bottom=-1;
 for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if(rgba[(y*image.width+x)*4+3]){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
 if(right<left)throw Error('Empty head layer.');
 return {x:left,y:top,width:right-left+1,height:bottom-top+1};
}
export function avatarPlacement(bounds,{x,y,size,padding=4}){
 if(![bounds.x,bounds.y,bounds.width,bounds.height,x,y,size,padding].every(Number.isFinite)||bounds.width<=0||bounds.height<=0||padding<0||size<=padding*2)throw Error('Invalid avatar geometry.');
 const scale=Math.min((size-padding*2)/bounds.width,(size-padding*2)/bounds.height);
 // Fit the entire alpha extent; common bottom baseline and equal inset. No clipping.
 return {x:x+(size-bounds.width*scale)/2,y:y+size-padding-bounds.height*scale,width:bounds.width*scale,height:bounds.height*scale,scale};
}
export function drawAvatar(c,{actor,image,bounds},expectedActor,box){
 if(actor!==expectedActor)throw Error('Avatar owner differs from matrix/figure owner.');
 const placed=avatarPlacement(bounds,box);
 c.drawImage(image,bounds.x,bounds.y,bounds.width,bounds.height,placed.x,placed.y,placed.width,placed.height);
 return placed;
}
