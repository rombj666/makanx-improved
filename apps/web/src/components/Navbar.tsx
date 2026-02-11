import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/Button';
import { Role } from '@makanx/shared';

export function Navbar() {
  const { user, logout } = useAuth();

  return (
    <nav className="border-b bg-white">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold text-blue-600">
          MakanX
        </Link>

        <div className="flex items-center gap-4">
          {user ? (
            <>
              <span className="text-sm text-gray-600">
                {user.name} ({user.role})
              </span>
              {user.role === Role.CUSTOMER && (
                <Link to="/customer/orders" className="text-sm hover:underline">
                  My Orders
                </Link>
              )}
              {user.role === Role.ORGANIZER && (
                <Link to="/organizer" className="text-sm hover:underline">
                  Dashboard
                </Link>
              )}
              {user.role === Role.VENDOR && (
                <Link to="/vendor" className="text-sm hover:underline">
                  Dashboard
                </Link>
              )}
              <Button variant="outline" size="sm" onClick={logout}>
                Logout
              </Button>
            </>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm">
                  Login
                </Button>
              </Link>
              <Link to="/register">
                <Button size="sm">Register</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
