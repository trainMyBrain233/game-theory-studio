import {cardTransform,CARD_GEOMETRY} from '../card-transform.mjs';

/** Reusable Canvas element. Resources and typography are supplied by its host;
 * importing this module does not load images, fonts or a content model.
 */
export function createCardElement({assets,palette,strategies,drawing,labelContract}){
 const {tx,round}=drawing;
 const {sourceViewBox,anchor,style}=labelContract;
 const metadata={id:'strategy-card',sourceViewBox,label:{...style,anchor},attachment:CARD_GEOMETRY};
 function draw(c,{kind,x,y,width=112,angle=0,flip=1,alpha=1,label=true}){
  const transform=cardTransform({x,y,w:width,angle,flip}),h=transform.height;
  c.save();c.globalAlpha*=alpha;c.translate(transform.x,transform.y);c.rotate(transform.angle);c.scale(transform.visibleScaleX,1);
  const image=assets['card-'+kind];if(image)c.drawImage(image,-width/2,-h/2,width,h);else round(c,-width/2,-h/2,width,h,8,palette.paper,palette.ink,3);
  if(label&&kind!=='back'){
   const s=width/sourceViewBox[2],lx=(anchor[0]-sourceViewBox[0]-sourceViewBox[2]/2)*s,ly=(anchor[1]-sourceViewBox[1]-sourceViewBox[3]/2)*s;
   tx(c,strategies[kind].label,lx,ly,style.fontSize*s,style.fontWeight,style.fill,style.align,{record:false,baseline:style.baseline});
  }
  c.restore();return {transform,metadata};
 }
 function drawFlip(c,{from,to,progress,...options}){return draw(c,{...options,kind:progress<.5?from:to,flip:Math.cos(Math.PI*progress)})}
 return {metadata,draw,drawFlip};
}
