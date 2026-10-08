// Geometry support is narrower than the data schema; reject ink overflow before drawing.
export const IDENTITY = {x:1136,y:512,column:286,row:164,avatarX:854,labelX:936,labelRight:1112};
export function identityTextPlan(view) {
 const {x,y,column,row,labelX,labelRight}=IDENTITY;
 return [
  {id:'column-owner',text:`${view.actors.B.name}选哪张牌（列）`,x:x+column-82,y:399,size:34,weight:700,left:x+column-82,right:1836},
  ...view.scene.strategies.flatMap((strategy,index)=>[
   {id:`row-${index}-owner`,text:view.actors.A.name,x:labelX,y:y+row*(index+.5)-20,size:34,weight:700,left:labelX,right:labelRight},
   {id:`row-${index}-strategy`,text:`选${strategy.label}（行）`,x:labelX,y:y+row*(index+.5)+29,size:32,weight:400,left:labelX,right:labelRight},
   {id:`column-${index}-strategy`,text:strategy.label,x:x+column*(index+.5),y:487,size:40,weight:700,align:'center',left:x+column*index+24,right:x+column*(index+1)-24},
  ]),
  {id:'payoff-order',text:`数对顺序：${view.actors.A.name}，${view.actors.B.name}`,x,y:y+2*row+72,size:34,weight:700,left:x,right:1836},
 ];
}
export function assertTextInk(context,plan,fontFor) {
 return plan.map(item=>{
  context.save();context.font=fontFor(item.size,item.weight);context.textAlign='left';
  const m=context.measureText(item.text),origin=item.x-(item.align==='center'?m.width/2:item.align==='right'?m.width:0);
  const bounds={left:origin-m.actualBoundingBoxLeft,right:origin+m.actualBoundingBoxRight,top:item.y-m.actualBoundingBoxAscent,bottom:item.y+m.actualBoundingBoxDescent};context.restore();
  if(!Object.values(bounds).every(Number.isFinite)||bounds.left<item.left||bounds.right>item.right||bounds.top<0||bounds.bottom>1080)
   throw Error(`UNSUPPORTED_TEXT_LAYOUT ${item.id}: ${JSON.stringify(item.text)} ink ${bounds.left.toFixed(2)}..${bounds.right.toFixed(2)} exceeds ${item.left}..${item.right}; keep the font size and revise the layout/name.`);
  return {...item,bounds};
 });
}
