import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('bootstrap loads private .env and rejects an unsafe password without printing it', () => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'maurus-bootstrap-'));
 try {
  const password='short-pw'; // deliberate invalid fixture, never a real credential
  fs.writeFileSync(path.join(dir,'.env'),`MONGODB_URI=mongodb://127.0.0.1:27017/test\nADMIN_NAME=Example Admin\nADMIN_EMAIL=admin@example.test\nADMIN_PASSWORD=${password}\n`);
  const env={...process.env}; for(const key of ['MONGODB_URI','ADMIN_NAME','ADMIN_EMAIL','ADMIN_PASSWORD']) delete env[key];
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const result=spawnSync(process.execPath,[path.join(root,'node_modules/tsx/dist/cli.mjs'),path.join(root,'src/create-admin.ts')],{cwd:dir,env,encoding:'utf8',timeout:10000});
  assert.equal(result.status,1);assert.match(result.stderr,/12–72 characters/);assert.doesNotMatch(result.stderr+result.stdout,new RegExp(password));
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
