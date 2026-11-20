import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

/** The user chooses when to reload so unsaved form content is not lost. */
export function UpdateNotice() {
 const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
 useEffect(() => {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  let active = true; let applying = false; let registration: ServiceWorkerRegistration | undefined;
  const changed = () => { if (applying) window.location.reload(); };
  navigator.serviceWorker.addEventListener('controllerchange', changed);
  const check = () => { if (document.visibilityState === 'visible') registration?.update().catch(() => {}); };
  navigator.serviceWorker.register('/sw.js').then(reg => {
    if (!active) return; registration = reg;
    if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      installing?.addEventListener('statechange', () => {
        if (active && installing.state === 'installed' && navigator.serviceWorker.controller) setWaiting(reg.waiting || installing);
      });
    });
  }).catch(() => {});
  document.addEventListener('visibilitychange', check);
  const timer = window.setInterval(check, 60 * 60 * 1000);
  const accept = () => { applying = true; };
  window.addEventListener('maurus-applying-update', accept);
  return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange',check); navigator.serviceWorker.removeEventListener('controllerchange',changed); window.removeEventListener('maurus-applying-update',accept); };
 }, []);
 if (!waiting) return null;
 return <div className="update-notice" role="status"><p>A new version is ready. Save your work before updating.</p><button className="small-action" onClick={() => { window.dispatchEvent(new Event('maurus-applying-update')); waiting.postMessage({type:'SKIP_WAITING'}); }}><RefreshCw size={16}/> Update now</button><button className="inline-button" onClick={()=>setWaiting(null)}>Later</button></div>;
}
