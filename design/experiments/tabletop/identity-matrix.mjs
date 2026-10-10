import {C,tx,round} from '../../../production/src/primitives.mjs';
import {canvasFont} from '../../../typography/fonts.mjs';
import {drawAvatar} from './avatar.mjs';
import {IDENTITY,identityTextPlan,assertTextInk} from './text-layout.mjs';

/** Shared by the public identity proof and its raster regression checks. */
export function drawIdentityMatrix(c,presentation,avatars){
 const avatar=(c,id,x,y,size)=>drawAvatar(c,avatars[id],id,{x,y,size,padding:Math.max(2,size/16)});
 const {x:mx,y:my,column:cw,row:ch}=IDENTITY;
 assertTextInk(c,identityTextPlan(presentation),canvasFont);
 avatar(c,'B',mx+cw-186,350,72);tx(c,`${presentation.actors.B.name}选哪张牌（列）`,mx+cw-82,399,34,700);
 for(const [column,strategy] of presentation.scene.strategies.entries())tx(c,strategy.label,mx+cw*(column+.5),487,40,700,C.ink,'center');
 for(const [row,strategy] of presentation.scene.strategies.entries()){
  const y=my+ch*(row+.5);avatar(c,'A',IDENTITY.avatarX,y-65,64);tx(c,presentation.actors.A.name,IDENTITY.labelX,y-20,34,700);tx(c,`选${strategy.label}（行）`,IDENTITY.labelX,y+29,32,400,C.muted);
  for(let column=0;column<2;column++){
   const selected=row===presentation.scene.selected.row&&column===presentation.scene.selected.column;
   round(c,mx+column*cw,my+row*ch,cw,ch,0,selected?C.faint:C.paper,C.ink,selected?4:2.5);
   tx(c,`(${presentation.matrix.values[row][column].join(', ')})`,mx+cw*(column+.5),y+18,48,700,C.ink,'center');
  }
 }
 tx(c,`数对顺序：${presentation.actors.A.name}，${presentation.actors.B.name}`,mx,my+2*ch+72,34,700);
}
