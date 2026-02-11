import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/Button';
import { Role } from '@makanx/shared';

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
              {user.role === Role.VENDOR && (
                <Link to="/vendor" className="text-sm hover:underline hover:text-orange-600">
                  Dashboard
                </Link>
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
