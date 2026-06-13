import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const links = [
  { label: 'Dashboard', to: '/vendor', end: true },
  { label: 'Menu', to: '/vendor/menu' },
  { label: 'Live Orders', to: '/vendor/live-orders' },
  { label: 'Sales', to: '/vendor/sales' },
  { label: 'Settings', to: '/vendor/settings' },
];

export function Navbar() {
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-xl px-3 py-2 text-sm font-semibold ${isActive ? 'bg-black text-white' : 'text-neutral-700 hover:bg-neutral-100'}`;

  return (
    <nav className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <NavLink to="/vendor" className="min-w-0 truncate font-bold text-neutral-950">
          Smart QR Ordering System
        </NavLink>
        <div className="hidden items-center gap-1 md:flex">
          {links.map((link) => <NavLink key={link.to} {...link} className={linkClass}>{link.label}</NavLink>)}
          <button onClick={logout} className="ml-2 rounded-xl px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Logout</button>
        </div>
        <button onClick={() => setOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-xl border md:hidden" aria-label="Open navigation">
          <Menu size={20} />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-y-0 right-0 w-[min(86vw,320px)] overflow-y-auto bg-white p-5" onClick={(event) => event.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              <span className="font-bold">Navigation</span>
              <button onClick={() => setOpen(false)} className="h-10 w-10 rounded-full border" aria-label="Close navigation"><X className="m-auto" size={18} /></button>
            </div>
            <div className="space-y-2">
              {links.map((link) => <NavLink key={link.to} {...link} onClick={() => setOpen(false)} className={({ isActive }) => `${linkClass({ isActive })} block w-full`}>{link.label}</NavLink>)}
              <button onClick={logout} className="flex w-full items-center justify-between rounded-xl border border-red-200 px-3 py-3 font-semibold text-red-700">
                Logout <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
