import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/Button';
import { Role } from '@makanx/shared';
import { BarChart3 } from 'lucide-react';

export function Navbar() {
  const { user, logout } = useAuth();

  return (
    <nav className="border-b bg-white shadow-sm">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
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
                <Link to="/organizer" className="text-sm hover:underline hover:text-orange-600">
                  Dashboard
                </Link>
              )}
              {user.role === 'VENDOR' && (
                <>
                  <NavLink
                    to="/vendor"
                    className={({ isActive }) =>
                      `text-sm font-medium transition-colors ${isActive ? 'text-orange-600' : 'text-gray-700 hover:text-orange-600'}`
                    }
                  >
                    Dashboard
                  </NavLink>
                  <NavLink
                    to="/vendor/sales"
                    className={({ isActive }) =>
                      `text-sm font-medium transition-colors ${isActive ? 'text-orange-600' : 'text-gray-700 hover:text-orange-600'} flex items-center gap-1`
                    }
                  >
                    <BarChart3 size={16} />
                    View Sales
                  </NavLink>
                  <NavLink
                    to="/vendor/menu"
                    className={({ isActive }) =>
                      `text-sm font-medium transition-colors ${isActive ? 'text-orange-600' : 'text-gray-700 hover:text-orange-600'}`
                    }
                  >
                    Menu
                  </NavLink>
                  <NavLink
                    to="/vendor/map"
                    className={({ isActive }) =>
                      `text-sm font-medium transition-colors ${isActive ? 'text-orange-600' : 'text-gray-700 hover:text-orange-600'}`
                    }
                  >
                    Booth
                  </NavLink>
                </>
              )}
              <Button variant="outline" size="sm" onClick={logout} className="border-orange-200 text-orange-700 hover:bg-orange-50 hover:text-orange-800">
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
              {/* Register button removed */}
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
