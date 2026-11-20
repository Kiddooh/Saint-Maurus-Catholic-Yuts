// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

describe('offline worker privacy', () => {
 it('intercepts only navigation and stores only the offline notice', async () => {
  const listeners:Record<string,(e:any)=>void>={};const added:string[]=[];
  const cache={add:async (path:string)=>{added.push(path)},match:async()=>new Response('offline')};
  const context={self:{location:{origin:'https://site.test'},clients:{claim:async()=>{}},addEventListener:(type:string,fn:(e:any)=>void)=>listeners[type]=fn},caches:{open:async()=>cache,keys:async()=>[]},fetch:async()=>{throw Error('offline')},URL,Response,Promise};
  runInNewContext(readFileSync('public/sw.js','utf8'),context);
  let install:Promise<unknown>;listeners.install({waitUntil:(p:Promise<unknown>)=>install=p});await install!;expect(added).toEqual(['/offline.html']);
  const dispatch=(url:string,mode:string,method='GET')=>{let response:Promise<Response>|undefined;listeners.fetch({request:{url,mode,method},respondWith:(p:Promise<Response>)=>response=p});return response;};
  expect(dispatch('https://site.test/api/admin/documents','navigate')).toBeUndefined();
  expect(dispatch('https://site.test/api/auth/me','cors')).toBeUndefined();
  expect(dispatch('https://site.test/assets/app.js','no-cors')).toBeUndefined();
  expect(dispatch('https://elsewhere.test/','navigate')).toBeUndefined();
  expect(dispatch('https://site.test/portal','navigate','POST')).toBeUndefined();
  expect(await (await dispatch('https://site.test/portal','navigate'))!.text()).toBe('offline');
 });
});
