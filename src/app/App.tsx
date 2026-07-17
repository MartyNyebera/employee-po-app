import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import { Dashboard } from './components/Dashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { LoginScreen } from './components/LoginScreen';
import { getStoredAuth, clearStoredAuth } from './api/client';
import { EmployeePortal } from './pages/EmployeePortal';
import { EmployeeLogin } from './pages/EmployeeLogin';
import { RequestsPage } from './pages/RequestsPage';
import { PurchasingPortal } from './pages/PurchasingPortal';
import { WarehousePortal } from './pages/WarehousePortal';
import { AccountingPortal } from './pages/AccountingPortal';
import { SalesPortal } from './pages/SalesPortal';
import { LogisticsPortal } from './pages/LogisticsPortal';

export type UserRole = 'employee' | 'admin' | 'bookkeeper' | 'purchasing' | 'office_admin' | null;

export default function App() {
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [userName, setUserName] = useState<string>('');
  const [userIsSuperAdmin, setUserIsSuperAdmin] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const auth = getStoredAuth();
    
    if (auth?.user) {
      setUserRole(auth.user.role);
      setUserName(auth.user.name);
      setUserIsSuperAdmin(!!auth.user.isSuperAdmin);
    } else {
            setUserRole(null);
      setUserName('');
      setUserIsSuperAdmin(false);
    }
    setCheckingAuth(false);
  }, []);

  const handleLogin = (role: UserRole, name: string, isSuperAdmin?: boolean) => {
    setUserRole(role);
    setUserName(name);
    setUserIsSuperAdmin(!!isSuperAdmin);
  };

  const handleLogout = () => {
    clearStoredAuth();
    setUserRole(null);
    setUserName('');
    setUserIsSuperAdmin(false);
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <img
            src="/kimoel-logo.png"
            alt="Kimoel Innovation"
            className="h-12 w-auto object-contain animate-pulse"
          />
          <div className="w-8 h-8 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" />
          <span className="text-sm font-medium text-slate-500">Loading Kimoel Tracking System...</span>
        </div>
      </div>
    );
  }

  // Allow portal routes to bypass the admin auth check — each portal guards itself with its
  // own token. A portal missing from this list is silently swallowed by LoginScreen below,
  // so every new portal MUST be added here as well as to the routes.
  const PORTAL_PATHS = ['/employee', '/production', '/requests', '/purchasing', '/warehouse', '/accounting', '/sales', '/logistics'];
  const currentPath = window.location.pathname;
  const isPortalRoute = PORTAL_PATHS.some(p => currentPath.startsWith(p));

  if (!userRole && !isPortalRoute) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <ErrorBoundary>
      <Router>
        <Routes>
        {/* Admin Portal Routes */}
        <Route path="/" element={
          !userRole ? (
            <LoginScreen onLogin={handleLogin} />
          ) : userRole === 'employee' ? (
            <Dashboard userName={userName} onLogout={handleLogout} />
          ) : (
            <AdminDashboard userName={userName} isSuperAdmin={userIsSuperAdmin} role={userRole as any} onLogout={handleLogout} />
          )
        } />

        {/* Employee Portal Routes */}
        <Route path="/employee" element={<EmployeePortal />} />
        <Route path="/employee/login" element={<EmployeeLogin />} />

        {/* Production portal — employee purchase requests (formerly /requests) */}
        <Route path="/production" element={<RequestsPage />} />
        {/* Back-compat: old /requests bookmarks redirect to /production */}
        <Route path="/requests" element={<Navigate to="/production" replace />} />

        {/* Purchasing Management portal (purchasing-role staff only) */}
        <Route path="/purchasing" element={<PurchasingPortal />} />

        {/* Warehouse portal (warehouse-account staff only) */}
        <Route path="/warehouse" element={<WarehousePortal />} />

        {/* Accounting portal (accounting-account staff only) */}
        <Route path="/accounting" element={<AccountingPortal />} />

        {/* Sales portal (sales-account staff only) */}
        <Route path="/sales" element={<SalesPortal />} />

        {/* Logistics portal (logistics-account staff only) */}
        <Route path="/logistics" element={<LogisticsPortal />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
    </ErrorBoundary>
  );
}
