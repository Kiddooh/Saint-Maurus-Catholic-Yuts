import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import app from './app.js';
app.locals.notifyRoles = async () => {}; app.locals.notifyUser = async () => {}; app.locals.signalNotification = async () => {};
import { User, LedgerEntry } from './models.js';
const id='507f1f77bcf86cd799439011', entryId='507f1f77bcf86cd799439012';
const password='correct-administrator-password';
const hash=bcrypt.hashSync(password,4);
const originalFind=User.findById;
process.env.JWT_SECRET='test-secret-at-least-32-characters-long'; mongoose.connection.readyState=1;
after(()=>{User.findById=originalFind;mongoose.connection.readyState=0;});
function account(role:'admin'|'member') { (User as any).findById=()=>({select:async()=>({id,name:'Account',email:'test@example.test',role,active:true,sessionVersion:1,passwordHash:hash})});return `session=${jwt.sign({ver:1},process.env.JWT_SECRET!,{subject:id,algorithm:'HS256'})}`; }
const body={kind:'income',amount:'123.45',category:'Outreach',description:'Community fundraiser',occurredOn:'2026-11-19',requestKey:'0196a468-00f1-4059-8dd3-1ae562cedabc',currentPassword:password};
test('finance rejects visitors and members and validates amounts and structure',async()=>{
 const member=account('member');
 await request(app).get('/api/admin/ledger').expect(401);
 await request(app).get('/api/admin/ledger').set('Cookie',member).expect(403);
 await request(app).post('/api/admin/ledger').set('Cookie',member).send(body).expect(403);
 const admin=account('admin');
 for(const amount of ['0','1.001','-2','1e3','100000000.01']) await request(app).post('/api/admin/ledger').set('Cookie',admin).send({...body,amount}).expect(400);
 await request(app).post('/api/admin/ledger').set('Cookie',admin).send({...body,occurredOn:'2026-02-30'}).expect(400);
 await request(app).post('/api/admin/ledger').set('Cookie',admin).send({...body,createdBy:'attacker'}).expect(400);
});
test('ledger uses step-up, exact cents, idempotency and atomic void',async()=>{
 const admin=account('admin'); const create=LedgerEntry.create, findOne=LedgerEntry.findOne, findUpdate=LedgerEntry.findOneAndUpdate, listIndexes=LedgerEntry.collection.listIndexes;let written:any, voidQuery:any, voidUpdate:any;
 try{
  (LedgerEntry.collection as any).listIndexes=()=>({toArray:async()=>[{unique:true,partialFilterExpression:{status:'posted'},key:{createdBy:1,requestKey:1}}]});
  await request(app).post('/api/admin/ledger').set('Cookie',admin).send(body).expect(503);
  (LedgerEntry.collection as any).listIndexes=()=>({toArray:async()=>[{unique:true,key:{createdBy:1,requestKey:1}}]});
  (LedgerEntry as any).create=async(v:any)=>{written=v;return {id:entryId};};
  await request(app).post('/api/admin/ledger').set('Cookie',admin).send({...body,currentPassword:'wrong'}).expect(403);assert.equal(written,undefined);
  const result=await request(app).post('/api/admin/ledger').set('Cookie',admin).send(body).expect(201);assert.equal(result.body.id,entryId);
  assert.equal(written.amountMinor,12345);assert.equal(written.createdBy,id);assert.equal(written.currentPassword,undefined);
  (LedgerEntry as any).create=async()=>{throw {code:11000}};
  (LedgerEntry as any).findOne=()=>({lean:async()=>({_id:entryId,...written})});
  const retry=await request(app).post('/api/admin/ledger').set('Cookie',admin).send(body).expect(200);assert.equal(retry.body.duplicate,true);
  await request(app).post('/api/admin/ledger').set('Cookie',admin).send({...body,amount:'123.46'}).expect(409);
  (LedgerEntry as any).findOneAndUpdate=async(q:any,u:any)=>{voidQuery=q;voidUpdate=u;return {_id:entryId}};
  await request(app).post(`/api/admin/ledger/${entryId}/void`).set('Cookie',admin).send({reason:'Duplicate entry',currentPassword:password}).expect(200);
  assert.equal(voidQuery.status,'posted');assert.equal(voidUpdate.$set.voidedBy,id);assert.equal(voidUpdate.$set.status,'void');
 } finally {LedgerEntry.create=create;LedgerEntry.findOne=findOne;LedgerEntry.findOneAndUpdate=findUpdate;LedgerEntry.collection.listIndexes=listIndexes;}
});
test('ledger lists totals as exact integer strings and validates cursor',async()=>{
 const admin=account('admin');const find=LedgerEntry.find,aggregate=LedgerEntry.aggregate;let match:any;
 try{
  (LedgerEntry as any).find=(q:any)=>{match=q;return {select:()=>({sort:()=>({limit:()=>({lean:async()=>[]})})})}};
  (LedgerEntry as any).aggregate=async()=>[{_id:'income',total:'90071992547409930'},{_id:'expense',total:'125'}];
  const result=await request(app).get('/api/admin/ledger?before='+entryId).set('Cookie',admin).expect(200);
  assert.equal(result.headers['cache-control'],'no-store');assert.equal(String(match._id.$lt),entryId);
  assert.equal(result.body.totals.net,'90071992547409805');
  await request(app).get('/api/admin/ledger?before[$ne]=x').set('Cookie',admin).expect(400);
 } finally {LedgerEntry.find=find;LedgerEntry.aggregate=aggregate;}
});
test('member session revocation is password protected and member-scoped',async()=>{
 const admin=account('admin');const update=User.findOneAndUpdate;let query:any,changes:any;
 try{
 (User as any).findOneAndUpdate=(q:any,u:any)=>{query=q;changes=u;return {select:async()=>({_id:entryId})}};
 await request(app).post(`/api/admin/members/${entryId}/revoke-sessions`).set('Cookie',admin).send({currentPassword:password}).expect(200);
 assert.deepEqual(query.role.$in,['member','finance','moderator']);assert.equal(changes.$inc.sessionVersion,1);
 } finally {User.findOneAndUpdate=update;}
});
