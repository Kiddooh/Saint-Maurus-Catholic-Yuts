import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

// Only intentionally public assets and known SPA routes may be served. Denylists of
// .env, .git, backups, admin directories etc. are insufficient for unknown secrets.
const files = new Set(['/index.html','/theme.js','/sw.js','/offline.html','/manifest.webmanifest','/hero.jpg','/library.jpg','/meditation.jpg','/icons/icon-192.png','/icons/icon-512.png','/icons/apple-touch-icon.png','/icons/favicon.ico','/icons/favicon-16.png','/icons/favicon-32.png','/icons/favicon-48.png','/icons/maskable-192.png','/icons/maskable-512.png']);
const pages = new Set(['/','/about','/ministries','/events','/community','/broadcasts','/library','/meditations','/media','/resources','/contact','/updates','/portal','/policies','/documents','/search']);
const hashedAsset = /^\/assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8}\.(?:js|css|woff2)$/;
function contained(root:string, file:string) { try { const relative=path.relative(fs.realpathSync(root),fs.realpathSync(file));return relative!=='' && relative!=='..' && !relative.startsWith('..'+path.sep) && !path.isAbsolute(relative); } catch {return false;} }
export function publicSite(root:string) {
  const router=express.Router();
  router.use((req,res,next)=>{
    // No escapes are needed for generated asset names or our routes. This prevents
    // encoded separators, double decoding and proxy normalization ambiguities.
    const pathname=req.path;
    if (pathname.includes('%') || pathname.includes('\\') || pathname.includes('//')) return res.status(404).end();
    if (files.has(pathname) || hashedAsset.test(pathname)) {
      if (!contained(root,path.join(root,pathname))) return res.status(404).end();
      return next();
    }
    if (pages.has(pathname)) return next();
    return res.status(404).end();
  });
  router.use(express.static(root,{index:false,dotfiles:'deny',setHeaders:(res,file)=>{if(['sw.js','index.html'].includes(path.basename(file)))res.setHeader('Cache-Control','no-cache');}}));
  router.get('*',(_req,res)=>{
    const index=path.join(root,'index.html');
    if(!contained(root,index)) return res.status(404).end();
    return res.set('Cache-Control','no-cache').sendFile(index);
  });
  return router;
}
