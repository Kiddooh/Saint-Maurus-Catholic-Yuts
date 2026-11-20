// @vitest-environment node
import { it, expect } from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
it('applies saved mode and palette before the app renders',()=>{
 const script=readFileSync('public/theme.js','utf8');
 function init(values:Record<string,string>,dark:boolean){
  const dataset:Record<string,string>={};let colour='';
  runInNewContext(script,{localStorage:{getItem:(key:string)=>values[key]},window:{matchMedia:()=>({matches:dark})},document:{documentElement:{dataset},querySelector:()=>({setAttribute:(_:string,v:string)=>{colour=v}})}});
  return {dataset,colour};
 }
 expect(init({'maurus-preview-theme':'system','maurus-palette':'ocean'},false)).toEqual({dataset:{theme:'light',palette:'ocean'},colour:'#f1f6f5'});
 expect(init({'maurus-preview-theme':'dark','maurus-palette':'chapel'},false)).toEqual({dataset:{theme:'dark',palette:'chapel'},colour:'#30242e'});
 expect(init({'maurus-palette':'invalid'},true)).toEqual({dataset:{theme:'dark',palette:'sanctuary'},colour:'#182a24'});
});
