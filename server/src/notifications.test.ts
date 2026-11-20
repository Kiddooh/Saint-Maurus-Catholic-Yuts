import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import app from './app.js';
import { Notification, User } from './models.js';
import { notifyRoles, setNotificationSignal } from './notifications.js';
const id='507f1f77bcf86cd799439011',other='507f1f77bcf86cd799439012';
process.env.JWT_SECRET='test-secret-at-least-32-characters-long';mongoose.connection.readyState=1;
const userFind=User.findById;after(()=>{User.findById=userFind;mongoose.connection.readyState=0;setNotificationSignal(async()=>{});});
function session(){(User as any).findById=()=>({select:async()=>({id,name:'Member',email:'member@example.test',role:'member',sessionVersion:1})});return `session=${jwt.sign({ver:1},process.env.JWT_SECRET!,{subject:id,algorithm:'HS256'})}`;}
test('notifications are account-owned and no-store',async()=>{
 const cookie=session();const find=Notification.find,count=Notification.countDocuments,update=Notification.updateOne,updateMany=Notification.updateMany;let listQuery:any,countQuery:any,updateQuery:any,allQuery:any;
 app.locals.signalNotification=async()=>{};
 try{
 (Notification as any).find=(q:any)=>{listQuery=q;return {select:()=>({sort:()=>({limit:()=>({lean:async()=>[]})})})}};
 (Notification as any).countDocuments=async(q:any)=>{countQuery=q;return 0};
 (Notification as any).updateOne=async(q:any)=>{updateQuery=q;return {matchedCount:0}};
 (Notification as any).updateMany=async(q:any)=>{allQuery=q;return {}};
 await request(app).get('/api/notifications').expect(401);
 const list=await request(app).get('/api/notifications').set('Cookie',cookie).expect(200);assert.equal(list.headers['cache-control'],'no-store');assert.equal(listQuery.user,id);assert.equal(countQuery.user,id);
 await request(app).patch(`/api/notifications/${other}/read`).set('Cookie',cookie).send({}).expect(404);assert.equal(updateQuery.user,id);
 await request(app).patch('/api/notifications/read-all').set('Cookie',cookie).send({}).expect(200);assert.equal(allQuery.user,id);assert.equal(allQuery.readAt,null);
 }finally{Notification.find=find;Notification.countDocuments=count;Notification.updateOne=update;Notification.updateMany=updateMany;}
});
test('role fanout only targets active authorized accounts and stores generic text',async()=>{
 const find=User.find,insert=Notification.insertMany;let filter:any,docs:any,signaled:string[]=[];
 try{
 (User as any).find=(q:any)=>{filter=q;return{select:()=>({limit:()=>({lean:async()=>[{_id:id},{_id:other}]})})}};
 (Notification as any).insertMany=async(v:any)=>{docs=v;return []};setNotificationSignal(async uid=>{signaled.push(uid)});
 await notifyRoles(['admin','moderator'],'A community post was reported.','Post reports');
 assert.deepEqual(filter.role.$in,['admin','moderator']);assert.deepEqual(filter.active,{$ne:false});assert.equal(docs.length,2);assert.equal(docs[0].message,'A community post was reported.');assert.deepEqual(signaled,[id,other]);
 }finally{User.find=find;Notification.insertMany=insert;}
});
test('community submissions notify only the intended roles without copying content',async()=>{
 const {Article,Comment,Report}=await import('./models.js');const articleExists=Article.exists,commentCreate=Comment.create,reportCreate=Report.create;const cookie=session();const calls:any[]=[];
 const previous=app.locals.notifyRoles;app.locals.notifyRoles=async(...args:any[])=>{calls.push(args)};
 try{
 (Article as any).exists=async()=>true;(Comment as any).create=async()=>({});(Report as any).create=async()=>({});
 await request(app).post(`/api/community/${other}/comments`).set('Cookie',cookie).send({text:'Sensitive example text',showName:false}).expect(201);
 await request(app).post(`/api/community/${other}/report`).set('Cookie',cookie).send({reason:'safety'}).expect(201);
 assert.deepEqual(calls.map(c=>c[0]),[['admin','moderator'],['admin','moderator']]);assert.equal(JSON.stringify(calls).includes('Sensitive example text'),false);assert.equal(JSON.stringify(calls).includes(id),false);
 }finally{Article.exists=articleExists;Comment.create=commentCreate;Report.create=reportCreate;app.locals.notifyRoles=previous;}
});

test('content security policy permits only same-host websocket and the map frame',async()=>{
 const res=await request(app).get('/health/live').set('Host','church.example').expect(200);
 assert.match(res.headers['content-security-policy'],/connect-src 'self' wss:\/\/church\.example/);
 assert.match(res.headers['content-security-policy'],/frame-src 'self' https:\/\/www\.google\.com/);
});
