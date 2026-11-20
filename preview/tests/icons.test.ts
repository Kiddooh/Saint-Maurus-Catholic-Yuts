// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('browser and install icons', () => {
 it('publishes actual PNGs with matching dimensions and distinct maskable icons', () => {
  const manifest=JSON.parse(readFileSync('public/manifest.webmanifest','utf8'));
  expect(manifest.icons.some((icon:{purpose:string})=>icon.purpose==='maskable')).toBe(true);
  expect(manifest.icons.some((icon:{purpose:string})=>icon.purpose==='any')).toBe(true);
  for(const icon of manifest.icons) {
   const data=readFileSync('public'+icon.src); const [w,h]=icon.sizes.split('x').map(Number);
   expect(data.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
   expect([data.readUInt32BE(16),data.readUInt32BE(20)]).toEqual([w,h]);
  }
  for(const n of [16,32,48]) { const data=readFileSync(`public/icons/favicon-${n}.png`); expect([data.readUInt32BE(16),data.readUInt32BE(20)]).toEqual([n,n]); }
  expect(readFileSync('public/icons/favicon.ico').readUInt16LE(2)).toBe(1);
 });
});
