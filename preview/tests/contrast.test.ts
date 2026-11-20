// @vitest-environment node
import { expect, it } from 'vitest';
import {readFileSync} from 'node:fs';
function luminance(hex:string) { const rgb=hex.match(/\w\w/g)!.map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]; }
function contrast(a:string,b:string){const [hi,lo]=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (hi+.05)/(lo+.05)}
it('core theme text tokens contrast against reading surfaces',()=>{
 const css=readFileSync('src/style.css','utf8');
 for(const theme of ['light','dark']){
  const rules=[...css.matchAll(new RegExp(`\\[data-theme=${theme}\\]\\{([^}]+)\\}`,'g'))]; const tokens=rules.at(-1)![1];
  const value=(name:string)=>tokens.match(new RegExp(`--${name}:(#[0-9a-f]{6})`))![1];
  for(const fg of ['ink','muted']) for(const bg of ['paper','surface','soft']) expect(contrast(value(fg),value(bg)),`${theme} ${fg}/${bg}`).toBeGreaterThanOrEqual(4.5);
 }
});

it('preserves selection in editable fields while removing the old override',()=>{
 const css=readFileSync('src/style.css','utf8');
 expect(css).toMatch(/body\{-webkit-user-select:none;user-select:none\}/);
 expect(css).toMatch(/input,textarea,select,\[contenteditable="true"\]\{-webkit-user-select:text;user-select:text\}/);
 expect(css).not.toContain('[data-selectable=true]');
});
it('meets text contrast for the main theme actions and links',()=>{
 expect(contrast('#fffdf6','#28553c')).toBeGreaterThanOrEqual(4.5);
 expect(contrast('#1b2d21','#e2c893')).toBeGreaterThanOrEqual(4.5);
 for(const bg of ['#f8f4eb','#fffdf8','#edf0e6']) expect(contrast('#23573d',bg)).toBeGreaterThanOrEqual(4.5);
 for(const bg of ['#151d1a','#22312b','#1a2822']) expect(contrast('#b9d4b9',bg)).toBeGreaterThanOrEqual(4.5);
});

it('maintains readable core colours in each additional palette and mode',()=>{
 const css=readFileSync('src/style.css','utf8');
 for(const theme of ['light','dark']) for(const palette of ['ocean','chapel']){
  const tokens=css.match(new RegExp(`\\[data-theme=${theme}\\]\\[data-palette=${palette}\\]\\{([^}]+)\\}`))![1];
  const value=(name:string)=>tokens.match(new RegExp(`--${name}:(#[0-9a-f]{6})(?:;|$)`))![1];
  for(const fg of ['ink','muted','green']) for(const bg of ['paper','surface','soft']) expect(contrast(value(fg),value(bg)),`${theme} ${palette} ${fg}/${bg}`).toBeGreaterThanOrEqual(4.5);
  expect(contrast(value('palette-action-text'),value('palette-action')),`${theme} ${palette} action`).toBeGreaterThanOrEqual(4.5);
 }
});
