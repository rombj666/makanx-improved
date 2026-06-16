import { ReactNode } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Role } from '@smart-qr/shared';
import { Toaster } from 'react-hot-toast';
import { Navbar } from './components/Navbar';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { CustomerLayout } from './layouts/CustomerLayout';
import { Login } from './pages/auth/Login';
import { ForgotPassword } from './pages/auth/ForgotPassword';
import { CustomerOrderPage } from './pages/customer/CustomerOrderPage';
import { TrackOrderPage } from './pages/customer/TrackOrderPage';
import { VendorDashboard } from './pages/vendor/Dashboard';
import { VendorMenu } from './pages/vendor/Menu';
import { VendorSales } from './pages/vendor/VendorSales';
import { VendorSettings } from './pages/vendor/Settings';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  if (isLoading) return <div className="p-8 text-center">Loading...</div>;
  if (!isAuthenticated || user?.role !== Role.VENDOR) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function VendorLayout() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-neutral-50">
        <Navbar />
        <Outlet />
      </div>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<CustomerLayout />}>
              <Route path="/v/:vendorSlug" element={<CustomerOrderPage />} />
              <Route path="/order/:vendorId" element={<CustomerOrderPage />} />
              <Route path="/track/:orderId" element={<TrackOrderPage />} />
            </Route>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/vendor" element={<VendorLayout />}>
              <Route index element={<VendorDashboard />} />
              <Route path="menu" element={<VendorMenu />} />
              <Route path="live-orders" element={<VendorDashboard />} />
              <Route path="sales" element={<VendorSales />} />
              <Route path="settings" element={<VendorSettings />} />
            </Route>
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
          <Toaster />
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}
