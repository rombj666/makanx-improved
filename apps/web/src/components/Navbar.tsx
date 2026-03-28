import React from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/Button';
import { Role } from '@makanx/shared';
import { BarChart3, Menu, X, LogOut } from 'lucide-react';
import { createPortal } from 'react-dom';

export function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileVendorMenuOpen, setMobileVendorMenuOpen] = React.useState(false);

  const isVendor = !!user?.vendorProfile?.id;
  const vendorTabs = [
    { label: 'Dashboard', to: '/vendor' },
    { label: 'Menu', to: '/vendor/menu' },
    { label: 'Booth', to: '/vendor/map' },
    { label: 'Sales', to: '/vendor/sales' },
  ];
  const vendorLinkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium transition-colors ${isActive ? 'text-black' : 'text-gray-700 hover:text-black'}`;

  return (
    <nav className="border-b bg-white shadow-sm overflow-x-hidden">
      <div className="hidden [@media(pointer:coarse)]:block max-w-[100vw] px-4 pt-3 pb-4">
        {user && isVendor ? (
          <>
            <div className="flex items-center justify-between">
              <Link to="/vendor" className="text-lg font-semibold text-black tracking-tight">
                MakanX
              </Link>
              <button
                type="button"
                onClick={() => setMobileVendorMenuOpen(true)}
                className="w-11 h-11 rounded-2xl border border-neutral-200 bg-white text-black flex items-center justify-center active:scale-95 transition"
                aria-label="Open menu"
              >
                <Menu size={20} />
              </button>
            </div>

            <div className="mt-3">
              <div className="inline-flex rounded-2xl border border-neutral-200 bg-white overflow-hidden">
                {vendorTabs.map((t) => (
                  <NavLink
                    key={t.to}
                    to={t.to}
                    className={({ isActive }) =>
                      `h-11 px-4 text-sm font-semibold transition-colors ${
                        isActive ? 'bg-black text-white' : 'bg-white text-black'
                      }`
                    }
                  >
                    {t.label}
                  </NavLink>
                ))}
              </div>
            </div>

            <VendorMobileMenu
              isOpen={mobileVendorMenuOpen}
              onClose={() => setMobileVendorMenuOpen(false)}
              onLogout={() => {
                setMobileVendorMenuOpen(false);
                logout();
              }}
              onNavigate={(to) => {
                setMobileVendorMenuOpen(false);
                if (location.pathname !== to) navigate(to);
              }}
              activePath={location.pathname}
            />
          </>
        ) : (
          <div className="flex items-center justify-between">
            <Link to="/" className="text-lg font-semibold text-black tracking-tight">
              MakanX
            </Link>
            {user ? (
              <button
                type="button"
                onClick={logout}
                className="h-11 px-4 rounded-2xl border border-neutral-200 bg-white text-black font-semibold text-sm active:scale-[0.99] transition"
              >
                Logout
              </button>
            ) : (
              <Link to="/login" className="h-11 px-4 rounded-2xl border border-neutral-200 bg-white text-black font-semibold text-sm flex items-center">
                Login
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="container mx-auto px-4 h-16 flex items-center justify-between [@media(pointer:coarse)]:hidden">
        <Link to="/" className="text-xl font-bold text-orange-600 hover:text-orange-700 transition-colors">
          MakanX
        </Link>

        <div className="flex items-center gap-4">
          {user ? (
            <>
              <span className="text-sm text-gray-600 hidden sm:inline">
                {user.name} ({user.role})
              </span>
              {user.role === Role.CUSTOMER && (
                <>
                  <Link to="/home" className="text-sm hover:underline hover:text-orange-600">
                    Events
                  </Link>
                  <Link to="/customer/orders" className="text-sm hover:underline hover:text-orange-600">
                    My Orders
                  </Link>
                </>
              )}
              {user.role === Role.ORGANIZER && (
                <Link to="/organizer" className="text-sm hover:underline hover:text-black text-black">
                  Dashboard
                </Link>
              )}
              {isVendor && (
                <>
                  <NavLink to="/vendor" className={vendorLinkClass}>
                    Dashboard
                  </NavLink>
                  <NavLink
                    to="/vendor/sales"
                    className={({ isActive }) =>
                      `${vendorLinkClass({ isActive })} flex items-center gap-1`
                    }
                  >
                    <BarChart3 size={16} />
                    View Sales
                  </NavLink>
                  <NavLink to="/vendor/menu" className={vendorLinkClass}>
                    Menu
                  </NavLink>
                  <NavLink to="/vendor/map" className={vendorLinkClass}>
                    Booth
                  </NavLink>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={logout}
                className="border-orange-200 text-orange-700 hover:bg-orange-50 hover:text-orange-800"
              >
                Logout
              </Button>
            </>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm" className="text-gray-600 hover:text-orange-600 hover:bg-orange-50">
                  Login
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

function VendorMobileMenu({
  isOpen,
  onClose,
  onLogout,
  onNavigate,
  activePath,
}: {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  onNavigate: (to: string) => void;
  activePath: string;
}) {
  React.useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const links = [
    { label: 'Dashboard', to: '/vendor' },
    { label: 'Menu', to: '/vendor/menu' },
    { label: 'Booth', to: '/vendor/map' },
    { label: 'Sales', to: '/vendor/sales' },
  ];

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/60" onMouseDown={onClose} onTouchStart={onClose}>
      <div
        className="absolute inset-x-0 bottom-0 bg-white rounded-t-3xl shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-neutral-100">
          <div className="text-base font-semibold text-black">Menu</div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full border border-neutral-200 text-black active:scale-95 transition"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-2">
          {links.map((l) => {
            const active = activePath === l.to;
            return (
              <button
                key={l.to}
                type="button"
                onClick={() => onNavigate(l.to)}
                className={`w-full h-12 rounded-2xl px-4 text-left font-semibold transition ${
                  active ? 'bg-black text-white' : 'bg-white border border-neutral-200 text-black'
                }`}
              >
                {l.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={onLogout}
            className="mt-3 w-full h-12 rounded-2xl px-4 text-left font-semibold bg-white border border-neutral-200 text-black flex items-center justify-between"
          >
            <span>Logout</span>
            <LogOut size={18} />
          </button>
          <div className="h-3" />
        </div>
      </div>
    </div>,
    document.body
  );
}
