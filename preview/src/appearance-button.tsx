import { SunMoon } from 'lucide-react';
export function AppearanceButton({onClick}:{onClick:()=>void}) {
 return <button type="button" className="appearance-trigger" onClick={onClick} aria-label="Open appearance settings" aria-haspopup="dialog" title="Appearance"><SunMoon size={19} aria-hidden="true"/></button>;
}
