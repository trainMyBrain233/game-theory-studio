/** Canonical design-to-production color adapter; no font/image/model side effects. */
import {assertTextContrast,productionTextPairs} from '../../design/text-contrast.mjs';
export function productionPalette(design,cardLabel='#FFFEF8'){
 const p=design.styles.textbook;
 const colors={paper:p.paper,ink:p.ink,secondary:p.muted,line:p.line,focus_fill:p.wash,
  red_strategy:design.semantic.strategyRed.fill,blue_strategy:design.semantic.strategyBlue.fill};
 assertTextContrast(productionTextPairs(colors,cardLabel));
 return colors;
}
