/** Card geometry in world canvas units. The visible flip collapses the face,
 * while a grip stays on the physical edge: it must not jump with cos(flip).
 * Both drawing and hand choreography consume this transform, including angle.
 */
export const CARD_GEOMETRY=Object.freeze({aspect:[140,190],gripXFraction:.4,gripReferenceWidth:105,gripReferenceY:-52});
export function cardTransform({x,y,w=112,angle=0,flip=1}){
 return {x,y,width:w,height:w*190/140,angle,visibleScaleX:Math.max(Math.abs(flip),.012)};
}
export function cardAttachment(transform,side){
 if(side!==1&&side!==-1)throw Error('Card grip side must be 1 or -1.');
 const local=[side*CARD_GEOMETRY.gripXFraction*transform.width,CARD_GEOMETRY.gripReferenceY*transform.width/CARD_GEOMETRY.gripReferenceWidth];
 const co=Math.cos(transform.angle),si=Math.sin(transform.angle);
 return {local,world:[transform.x+local[0]*co-local[1]*si,transform.y+local[0]*si+local[1]*co],space:'world',flipPolicy:'physical_edge_no_cosine_jump'};
}
