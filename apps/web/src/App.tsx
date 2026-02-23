import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { Navbar } from './components/Navbar';
import { Login } from './pages/auth/Login';
// import { Register } from './pages/auth/Register'; // Removed
import { Invite } from './pages/auth/Invite';
import { ForgotPassword } from './pages/auth/ForgotPassword';
import ApplicationStatusPage from './pages/ApplicationStatus';
import { CustomerHome } from './pages/customer/Home';
import { EventMap } from './pages/customer/EventMap';
import { CustomerOrders } from './pages/customer/Orders';
import { VendorDashboard } from './pages/vendor/Dashboard';
import { VendorOrders } from './pages/vendor/Orders';
import { VendorMenu } from './pages/vendor/Menu';
import { OrganizerDashboard as OrganizerLegacyDashboard } from './pages/organizer/Dashboard';
import { OrganizerDashboard } from './pages/organizer/OrganizerDashboard';
import { MapEditor } from './pages/organizer/MapEditor';
import { OrganizerApplicationsPage } from './pages/organizer/OrganizerApplicationsPage';
import { OrganizerVendorsPage } from './pages/organizer/OrganizerVendorsPage';
import { OrganizerSalesPlaceholder } from './pages/organizer/OrganizerSalesPlaceholder';
import { Role } from '@makanx/shared';
import { Toaster } from 'react-hot-toast';

import { DebugStatic } from './pages/DebugStatic';

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: Role[] }) {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) return <div>Loading...</div>;
  if (!isAuthenticated) return <Navigate to="/login" />;

  if (roles && user && !roles.includes(user.role)) {
    // If user is logged in but role doesn't match, maybe go to their dashboard?
    // For now root is fine, but root redirects to login if not authenticated.
    // Wait, root / currently renders CustomerHome. 
    // We want root / to redirect to /login? 
    // User request: "Ensure "/" redirects to "/login" (no default landing page)."
    // So CustomerHome should probably be moved to /home or similar? 
    // Or we keep CustomerHome but only if logged in?
    // The user said "Ensure "/" redirects to "/login"".
    // So I will make / redirect to /login.
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
              <Route path="/" element={<Navigate to="/login" replace />} />
              {/* Customer Home was at /, now accessible via... maybe just for logged in users? 
                  Or maybe we move CustomerHome to /events or /home? 
                  The prompt says "no default landing page", implying the app is gated. 
                  But CustomerHome was public before. 
                  "Ensure "/" redirects to "/login" (no default landing page)."
                  I will assume the public event page /customer/event/:slug is still accessible.
                  But the generic home list is gone or hidden.
                  Let's create a /home route for CustomerHome if needed, OR just hide it.
                  I'll map /home to CustomerHome for now so it's not lost.
              */}
              <Route path="/home" element={<CustomerHome />} />
              
              <Route path="/customer/event/:slug" element={<EventMap />} />
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/application-status" element={<ApplicationStatusPage />} />
              {/* <Route path="/register" element={<Register />} /> */}
              <Route path="/invite" element={<Invite />} />
              <Route path="/debug/static" element={<DebugStatic />} />

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
                <Route path="legacy" element={<OrganizerLegacyDashboard />} />
                <Route path="map/:eventId" element={<MapEditor />} />
                <Route path="applications" element={<OrganizerApplicationsPage />} />
                <Route path="vendors" element={<OrganizerVendorsPage />} />
                <Route path="sales" element={<OrganizerSalesPlaceholder />} />
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
                <Route path="orders" element={<VendorOrders />} />
                <Route path="menu" element={<VendorMenu />} />
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
