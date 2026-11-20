import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { io as connect, type Socket } from 'socket.io-client';
import { User } from './models.js';
import { attachRealtime } from './realtime.js';

const id='507f1f77bcf86cd799439011',other='507f1f77bcf86cd799439012';
test('socket requires same-origin authenticated active sessions and signals only the owner',async()=>{
 const prior=User.findById,oldSecret=process.env.JWT_SECRET,oldEnv=process.env.NODE_ENV;process.env.JWT_SECRET='test-secret-at-least-32-characters-long';process.env.NODE_ENV='development';mongoose.connection.readyState=1;
 const versions:Record<string,number>={[id]:1,[other]:1};(User as any).findById=(uid:string)=>({select:async()=>({id:uid,sessionVersion:versions[uid],active:true})});
 const server=createServer();const {io,signal}=attachRealtime(server);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw Error('no port');const origin=`http://127.0.0.1:${address.port}`;const clients:Socket[]=[];
 const make=(user:string,originHeader=origin,withCookie=true)=>{const token=jwt.sign({ver:1},process.env.JWT_SECRET!,{subject:user,algorithm:'HS256',expiresIn:'5m'});const s=connect(origin,{transports:['websocket'],reconnection:false,timeout:2000,extraHeaders:{origin:originHeader,...(withCookie?{cookie:`session=${token}`}:{})}});clients.push(s);return s;};
 const wait=(s:Socket,event:string)=>new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Timed out waiting for '+event)),3000);s.once(event,()=>{clearTimeout(timer);resolve()})});
 try{
  const denied=make(id,'https://evil.example');await wait(denied,'connect_error');
  const anonymous=make(id,origin,false);await wait(anonymous,'connect_error');
  const first=make(id);await wait(first,'connect');const second=make(other);await wait(second,'connect');let otherReceived=false;second.on('notifications:changed',()=>{otherReceived=true});const received=wait(first,'notifications:changed');await signal(id);await received;assert.equal(otherReceived,false);
  versions[id]=2;const disconnected=wait(first,'disconnect');await signal(id);await disconnected;assert.equal(first.connected,false);assert.equal(second.connected,true);
 }finally{clients.forEach(s=>s.disconnect());await new Promise<void>(resolve=>io.close(()=>resolve()));User.findById=prior;mongoose.connection.readyState=0;if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;if(oldEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldEnv;}
});
