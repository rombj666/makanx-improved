import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { Navbar } from './components/Navbar';
import { Login } from './pages/auth/Login';
import { Register } from './pages/auth/Register';
import { Invite } from './pages/auth/Invite';
import { CustomerHome } from './pages/customer/Home';
import { EventMap } from './pages/customer/EventMap';
import { CustomerOrders } from './pages/customer/Orders';
import { OrganizerDashboard } from './pages/organizer/Dashboard';
import { MapEditor } from './pages/organizer/MapEditor';
import { VendorApplications } from './pages/organizer/VendorApplications';
import { VendorDashboard } from './pages/vendor/Dashboard';
import { Role } from '@makanx/shared';
import { Toaster } from 'react-hot-toast';

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: Role[] }) {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) return <div>Loading...</div>;
  if (!isAuthenticated) return <Navigate to="/login" />;

  if (roles && user && !roles.includes(user.role)) {
    return <Navigate to="/" />;
  }

  return <>{children}</>;
}

function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              {/* Public Routes */}
              <Route path="/" element={<CustomerHome />} />
              <Route path="/customer/event/:slug" element={<EventMap />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/invite" element={<Invite />} />

              {/* Customer Protected */}
              <Route 
                path="/customer/orders" 
                element={
                  <ProtectedRoute roles={[Role.CUSTOMER]}>
                    <CustomerOrders />
                  </ProtectedRoute>
                } 
              />

              {/* Organizer Routes */}
              <Route
                path="/organizer"
                element={
                  <ProtectedRoute roles={[Role.ORGANIZER]}>
                    <Outlet />
                  </ProtectedRoute>
                }
              >
                <Route index element={<OrganizerDashboard />} />
                <Route path="map/:eventId" element={<MapEditor />} />
                <Route path="applications" element={<VendorApplications />} />
              </Route>

              {/* Vendor Routes */}
              <Route
                path="/vendor"
                element={
                  <ProtectedRoute roles={[Role.VENDOR]}>
                    <Outlet />
                  </ProtectedRoute>
                }
              >
                <Route index element={<VendorDashboard />} />
              </Route>
            </Route>
          </Routes>
          <Toaster />
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
