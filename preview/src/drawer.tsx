import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** Modal side drawer: traps focus, closes on Escape/backdrop, restores focus and page scrolling. */
export function Drawer({ title, onClose, children }: {title:string;onClose:()=>void;children:ReactNode}) {
  const panel = useRef<HTMLElement>(null); const layer = useRef<HTMLDivElement>(null); const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null; const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Keep background controls out of the keyboard and accessibility trees while modal.
    const siblings = Array.from(document.body.children).filter(el => el !== layer.current);
    const inertBefore = siblings.map(el => el.hasAttribute('inert'));
    siblings.forEach(el => el.setAttribute('inert', ''));
    panel.current?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(el => el.getClientRects().length > 0);
      if (!items.length) { e.preventDefault(); panel.current.focus(); return; }
      const first = items[0], last = items[items.length-1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handle);
    return () => { document.removeEventListener('keydown', handle); document.body.style.overflow = oldOverflow; siblings.forEach((el, i) => { if (!inertBefore[i]) el.removeAttribute('inert'); }); if (previous?.isConnected && !previous.closest('[inert]')) previous.focus(); };
  }, []);
  return createPortal(<div ref={layer} className="drawer-layer" onMouseDown={e => {if(e.target===e.currentTarget) onClose();}}><section ref={panel} tabIndex={-1} className="drawer" role="dialog" aria-modal="true" aria-label={title}><div className="drawer-header"><div><span>ST. MAURUS YOUTH</span><h2>{title}</h2></div><button className="drawer-close" onClick={onClose} aria-label={`Close ${title}`}><X size={21}/></button></div><div className="drawer-content">{children}</div></section></div>, document.body);
}
