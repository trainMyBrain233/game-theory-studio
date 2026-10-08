import {cardTransform,CARD_GEOMETRY} from '../card-transform.mjs';

/** Reusable Canvas element. Resources and typography are supplied by its host;
 * importing this module does not load images, fonts or a content model.
 */
export function createCardElement({assets,palette,strategies,drawing}){
 const {tx,round}=drawing;
 const metadata={id:'strategy-card',sourceViewBox:[0,0,...CARD_GEOMETRY.aspect],label:{baseline:'alphabetic',align:'center',weight:700,yHeightFraction:.31,minFontSize:28,widthFontFraction:.29},attachment:CARD_GEOMETRY};
 function draw(c,{kind,x,y,width=112,angle=0,flip=1,alpha=1,label=true}){
  const transform=cardTransform({x,y,w:width,angle,flip}),h=transform.height;
  c.save();c.globalAlpha*=alpha;c.translate(transform.x,transform.y);c.rotate(transform.angle);c.scale(transform.visibleScaleX,1);
  const image=assets['card-'+kind];if(image)c.drawImage(image,-width/2,-h/2,width,h);else round(c,-width/2,-h/2,width,h,8,palette.paper,palette.ink,3);
  if(label&&kind!=='back')tx(c,strategies[kind].label,0,h*.31,Math.max(28,width*.29),700,palette.white,'center',{record:false});
  c.restore();return {transform,metadata};
 }
 function drawFlip(c,{from,to,progress,...options}){return draw(c,{...options,kind:progress<.5?from:to,flip:Math.cos(Math.PI*progress)})}
 return {metadata,draw,drawFlip};
}
