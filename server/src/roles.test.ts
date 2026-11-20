import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import app from './app.js';
app.locals.notifyRoles = async () => {}; app.locals.notifyUser = async () => {}; app.locals.signalNotification = async () => {};
import {User, LedgerEntry, Comment, Report} from './models.js';
const id='507f1f77bcf86cd799439011', target='507f1f77bcf86cd799439012';
const password='correct-password-for-testing';const hash=bcrypt.hashSync(password,4);
process.env.JWT_SECRET='test-secret-at-least-32-characters-long';mongoose.connection.readyState=1;
const original=User.findById;after(()=>{User.findById=original;mongoose.connection.readyState=0});
function auth(role:string,version=1){(User as any).findById=()=>({select:async()=>({id,name:'User',email:'user@example.test',role,active:true,sessionVersion:version,passwordHash:hash})});return `session=${jwt.sign({ver:1},process.env.JWT_SECRET!,{subject:id,algorithm:'HS256'})}`;}
test('finance and moderation APIs use distinct server-side access rules',async()=>{
 const ledgerFind=LedgerEntry.find, ledgerAggregate=LedgerEntry.aggregate, comments=Comment.find, reports=Report.find;
 try{
 (LedgerEntry as any).find=()=>({select:()=>({sort:()=>({limit:()=>({lean:async()=>[]})})})});(LedgerEntry as any).aggregate=async()=>[];
 const query=()=>({populate(){return this},sort(){return this},limit(){return this},lean:async()=>[]});
 (Comment as any).find=query;(Report as any).find=query;
 const finance=auth('finance');await request(app).get('/api/admin/ledger').set('Cookie',finance).expect(200);await request(app).get('/api/admin/comments').set('Cookie',finance).expect(403);await request(app).get('/api/admin/reports').set('Cookie',finance).expect(403);await request(app).get('/api/admin/members').set('Cookie',finance).expect(403);await request(app).get('/api/admin/documents').set('Cookie',finance).expect(403);
 const moderator=auth('moderator');await request(app).get('/api/admin/comments').set('Cookie',moderator).expect(200);await request(app).get('/api/admin/reports').set('Cookie',moderator).expect(200);await request(app).get('/api/admin/ledger').set('Cookie',moderator).expect(403);await request(app).get('/api/admin/articles').set('Cookie',moderator).expect(403);await request(app).get('/api/admin/members').set('Cookie',moderator).expect(403);
 const member=auth('member');await request(app).get('/api/admin/comments').set('Cookie',member).expect(403);await request(app).get('/api/admin/ledger').set('Cookie',member).expect(403);
 }finally{LedgerEntry.find=ledgerFind;LedgerEntry.aggregate=ledgerAggregate;Comment.find=comments;Report.find=reports;}
});
test('finance staff must reauthenticate with their own password for ledger writes',async()=>{
 const finance=auth('finance');const create=LedgerEntry.create, indexes=LedgerEntry.collection.listIndexes;let written:any;
 try{
 (LedgerEntry.collection as any).listIndexes=()=>({toArray:async()=>[{unique:true,key:{createdBy:1,requestKey:1}}]});(LedgerEntry as any).create=async(v:any)=>{written=v;return{id:target}};
 const body={kind:'expense',amount:'5.25',category:'Supplies',description:'Stationery',occurredOn:'2026-11-19',requestKey:'0196a468-00f1-4059-8dd3-1ae562cedabc',currentPassword:password};
 await request(app).post('/api/admin/ledger').set('Cookie',finance).send({...body,currentPassword:'incorrect'}).expect(403);
 await request(app).post('/api/admin/ledger').set('Cookie',finance).send(body).expect(201);assert.equal(written.createdBy,id);assert.equal(written.amountMinor,525);
 }finally{LedgerEntry.create=create;LedgerEntry.collection.listIndexes=indexes;}
});
test('only an administrator may assign limited roles, with reauthentication and session revocation',async()=>{
 const update=User.findOneAndUpdate;let query:any,change:any;
 try{
 (User as any).findOneAndUpdate=(q:any,u:any)=>{query=q;change=u;return {select:async()=>({_id:target,name:'Other',role:'finance'})}};
 const member=auth('member');await request(app).patch(`/api/admin/members/${target}/role`).set('Cookie',member).send({role:'finance',currentPassword:password}).expect(403);
 const finance=auth('finance');await request(app).patch(`/api/admin/members/${target}/role`).set('Cookie',finance).send({role:'finance',currentPassword:password}).expect(403);
 const admin=auth('admin');await request(app).patch(`/api/admin/members/${target}/role`).set('Cookie',admin).send({role:'admin',currentPassword:password}).expect(400);
 await request(app).patch(`/api/admin/members/${target}/role`).set('Cookie',admin).send({role:'finance',currentPassword:'wrong'}).expect(403);assert.equal(query,undefined);
 await request(app).patch(`/api/admin/members/${target}/role`).set('Cookie',admin).send({role:'finance',currentPassword:password}).expect(200);
 assert.deepEqual(query.role.$in,['member','finance','moderator']);assert.ok(!query.role.$in.includes('admin'));assert.equal(change.$set.role,'finance');assert.equal(change.$inc.sessionVersion,1);
 const stale=auth('finance',2);await request(app).get('/api/auth/me').set('Cookie',stale).expect(401);
 }finally{User.findOneAndUpdate=update;}
});
test('public signup cannot set a privileged role',async()=>{
 const create=User.create;
 try{
  let written:any;(User as any).create=async(v:any)=>{written=v;return {id,name:v.name,email:v.email,role:'member',sessionVersion:0}};
  await request(app).post('/api/auth/register').send({name:'New Member',email:'new@example.test',password:'strong-password-123',adult:true,role:'admin'}).expect(201);
  assert.equal(written.role,undefined);
 }finally{User.create=create;}
});
