import { Notification, User } from './models.js';

export type NotificationTarget = 'Content'|'Moderation'|'Post reports'|'Messages'|'Membership requests'|'My activity'|'Membership';
let signal:(userId:string)=>Promise<void> = async()=>{};
export function setNotificationSignal(fn:(userId:string)=>Promise<void>){signal=fn;}
export async function signalNotification(userId:string){await signal(userId);}
// Content is intentionally generic: no names, message text, reports, or financial data.
export async function notifyUser(userId:string, message:string, target:NotificationTarget){
 if(!userId)return;
 await Notification.create({user:userId,message,target});
 await signal(userId);
}
export async function notifyRoles(roles:('admin'|'moderator')[], message:string,target:NotificationTarget){
 const users=await User.find({role:{$in:roles},active:{$ne:false}}).select('_id').limit(100).lean();
 if(!users.length)return;
 await Notification.insertMany(users.map(u=>({user:u._id,message,target})));
 await Promise.all(users.map(u=>signal(String(u._id))));
}
// A failed alert should not roll back a completed community or membership action.
export async function bestEffort(action:()=>Promise<void>){try{await action();}catch{console.error(JSON.stringify({level:'error',event:'notification_delivery_failed'}));}}
