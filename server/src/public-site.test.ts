import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { publicSite } from './public-site.js';
test('static allowlist serves only intended files and rejects hidden paths and symlinks',async()=>{
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'maurus-static-'));const root=path.join(parent,'dist');fs.mkdirSync(path.join(root,'assets'),{recursive:true});
 try {
 fs.mkdirSync(path.join(root,'icons'));for(const name of ['favicon.ico','favicon-16.png','favicon-32.png','favicon-48.png','maskable-192.png','maskable-512.png'])fs.writeFileSync(path.join(root,'icons',name),'icon');fs.writeFileSync(path.join(root,'index.html'),'public page');fs.writeFileSync(path.join(root,'hero.jpg'),'public image');fs.writeFileSync(path.join(root,'assets/index-ABCDEFGH.js'),'public javascript');fs.writeFileSync(path.join(root,'.env'),'secret');fs.mkdirSync(path.join(root,'docs'));fs.writeFileSync(path.join(root,'docs/private.pdf'),'secret');fs.writeFileSync(path.join(parent,'secret'),'secret');fs.symlinkSync(path.join(parent,'secret'),path.join(root,'assets/safe-ABCDEFGH.js'));
 const app=express().use(publicSite(root));
 for(const name of ['favicon.ico','favicon-16.png','favicon-32.png','favicon-48.png','maskable-192.png','maskable-512.png'])await request(app).get('/icons/'+name).expect(200);await request(app).get('/').expect(200);await request(app).get('/search').expect(200);await request(app).get('/hero.jpg').expect(200);await request(app).get('/assets/index-ABCDEFGH.js').expect(200);
 for(const p of ['/.env','/.git/config','/docs/private.pdf','/server/.env','/admin','/backup.zip','/assets/safe-ABCDEFGH.js','/assets/index-ABCDEFGH.js.map','/%2eenv','/%252eenv','/assets%2findex-ABCDEFGH.js']){const res=await request(app).get(p).expect(404);assert.ok(!res.text?.includes('secret'),p);}
 } finally {fs.rmSync(parent,{recursive:true,force:true});}
});
