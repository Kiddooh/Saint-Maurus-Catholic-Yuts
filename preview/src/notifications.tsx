import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Bell, CheckCheck } from 'lucide-react';
import { api, formatDate } from './api';
import { Drawer } from './drawer';

type Item={_id:string;message:string;target:string;readAt:string|null;createdAt:string};
type Result={items:Item[];unread:number};
export function Notifications({panels,onSelect}:{panels:string[];onSelect:(panel:string)=>void}){
 const [open,setOpen]=useState(false);const [items,setItems]=useState<Item[]>([]);const [unread,setUnread]=useState(0);const [status,setStatus]=useState('');const [live,setLive]=useState(false);const [busy,setBusy]=useState(false);const mounted=useRef(false);const sequence=useRef(0);
 const refresh=useCallback(async()=>{const current=++sequence.current;try{const data=await api<Result>('/notifications');if(!mounted.current||sequence.current!==current)return;if(!Array.isArray(data.items)||typeof data.unread!=='number')throw new Error('Unavailable');setItems(data.items);setUnread(data.unread);setStatus('');}catch{if(mounted.current&&sequence.current===current)setStatus('Notifications are unavailable. Please try again.');}},[]);
 useEffect(()=>{
  mounted.current=true;refresh();
  const socket=io({path:'/socket.io',transports:['websocket'],withCredentials:true,timeout:10000});
  socket.on('connect',()=>{if(mounted.current){setLive(true);refresh();}});
  socket.on('disconnect',()=>{if(mounted.current)setLive(false)});
  socket.on('connect_error',()=>{if(mounted.current)setLive(false)});
  socket.on('notifications:changed',refresh);
  const visible=()=>{if(document.visibilityState==='visible')refresh()};document.addEventListener('visibilitychange',visible);
  const timer=window.setInterval(visible,60000);
  return ()=>{mounted.current=false;sequence.current++;socket.disconnect();document.removeEventListener('visibilitychange',visible);window.clearInterval(timer)};
 },[refresh]);
 async function mark(item?:Item){setBusy(true);try{await api(item?'/notifications/'+item._id+'/read':'/notifications/read-all',{method:'PATCH',body:'{}'});await refresh();}catch{setStatus('Could not update notifications. Please try again.');}finally{setBusy(false)}}
 async function openItem(item:Item){if(!item.readAt){setBusy(true);try{await api('/notifications/'+item._id+'/read',{method:'PATCH',body:'{}'});await refresh();}catch{setStatus('Could not mark this notification as read.');setBusy(false);return;}setBusy(false);}if(panels.includes(item.target)){setOpen(false);onSelect(item.target);}}
 return <><button className="notification-trigger" onClick={()=>setOpen(true)} aria-label={`Notifications, ${unread} unread`} aria-haspopup="dialog"><Bell size={20}/>{unread>0&&<span aria-hidden="true">{unread>99?'99+':unread}</span>}</button>{open&&<Drawer title="Notifications" onClose={()=>setOpen(false)}><div className="notification-head"><p>{unread} unread · {live?'Live updates connected':'Updates may be delayed'}</p><button className="inline-button" disabled={busy||!unread} onClick={()=>mark()}><CheckCheck size={16}/> Mark all read</button></div><p className="field-hint">Showing the latest 50. Notifications expire after 90 days.</p>{status&&<p role="status" className="form-status">{status}</p>}{!items.length&&!status&&<p className="body-copy">You have no notifications yet.</p>}<div className="notification-list">{items.map(item=><article className={'notification-item '+(!item.readAt?'unread':'')} key={item._id}><div><strong>{item.message}</strong><small>{formatDate(item.createdAt)} · {item.readAt?'Read':'Unread'}</small></div><div className="row-actions">{panels.includes(item.target)&&<button className="inline-button" disabled={busy} onClick={()=>openItem(item)}>Open {item.target}</button>}{!item.readAt&&<button className="inline-button" disabled={busy} onClick={()=>mark(item)}>Mark read</button>}</div></article>)}</div></Drawer>}</>;
}
