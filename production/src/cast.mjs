import fs from 'node:fs';
export const CAST=JSON.parse(fs.readFileSync(new URL('../cast.json',import.meta.url),'utf8'));
export function resolveCastText(text){return String(text).replaceAll('{{A}}',CAST.actors.A.display_name).replaceAll('{{B}}',CAST.actors.B.display_name)}
