import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { parse } from 'cookie';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { User } from './models.js';
import { setNotificationSignal } from './notifications.js';

// A socket can only join its verified user's room. Events are wake-up signals,
// never private content. The REST API rechecks auth and returns the actual data.
export function attachRealtime(server:HttpServer){
 const io=new Server(server,{
  serveClient:false, transports:['websocket'], maxHttpBufferSize:1024,
  allowRequest:(req,done)=>{
   const origin=req.headers.origin,host=req.headers.host;
   try{const url=new URL(origin || '');const ok=url.origin===origin && url.host===host && ['https:','http:'].includes(url.protocol) && (process.env.NODE_ENV!=='production'||url.protocol==='https:');done(null,ok);}catch{done(null,false);}
  }
 });
 io.use(async(socket,next)=>{
  try{
   const secret=process.env.JWT_SECRET||''; if(secret.length<32||mongoose.connection.readyState!==1) return next(new Error('Unauthorized'));
   const token=parse(socket.handshake.headers.cookie||'').session;
   const payload=jwt.verify(token||'',secret,{algorithms:['HS256']}) as jwt.JwtPayload;
   if(typeof payload.sub!=='string'||!mongoose.isValidObjectId(payload.sub)||typeof payload.ver!=='number'||typeof payload.exp!=='number')return next(new Error('Unauthorized'));
   const user=await User.findById(payload.sub).select('active sessionVersion');
   if(!user||user.active===false||user.sessionVersion!==payload.ver)return next(new Error('Unauthorized'));
   // A bounded number of concurrent connections per user on this instance.
   const existing=await io.in('user:'+payload.sub).fetchSockets();if(existing.length>=8)return next(new Error('Too many connections'));
   socket.data.userId=payload.sub;socket.data.version=payload.ver;socket.data.exp=payload.exp;
   next();
  }catch{return next(new Error('Unauthorized'));}
 });
 io.on('connection',socket=>{
  socket.join('user:'+socket.data.userId);
  const expiry=setTimeout(()=>socket.disconnect(true),Math.max(0,Math.min(2147483647,socket.data.exp*1000-Date.now())));
  socket.on('disconnect',()=>clearTimeout(expiry));
  // This channel is server-to-client only; clients cannot request a room or emit notifications.
  socket.onAny(()=>socket.disconnect(true));
 });
 const signal=async(userId:string)=>{
  const sockets=await io.in('user:'+userId).fetchSockets();if(!sockets.length)return;
  if(mongoose.connection.readyState!==1){sockets.forEach(socket=>socket.disconnect(true));return;}
  const user=await User.findById(userId).select('active sessionVersion');
  for(const socket of sockets){
   if(!user||user.active===false||user.sessionVersion!==socket.data.version||socket.data.exp*1000<=Date.now())socket.disconnect(true);
   else socket.emit('notifications:changed');
  }
 };
 setNotificationSignal(signal);
 return {io, signal};
}
