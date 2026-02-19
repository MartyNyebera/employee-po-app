import { useState, useEffect } from 'react';
import { LoginScreen } from './components/LoginScreen';
import { Dashboard } from './components/Dashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { getStoredAuth, clearStoredAuth } from './api/client';

export type UserRole = 'employee' | 'admin' | null;

export default function App() {
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [userName, setUserName] = useState<string>('');
  const [userIsSuperAdmin, setUserIsSuperAdmin] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    console.log('[App] Checking stored auth...');
    
    // Check if this is a fresh session (PWA restart)
    const sessionStart = sessionStorage.getItem('sessionStart');
    if (!sessionStart) {
      console.log('[App] Fresh session detected - clearing auth');
      clearStoredAuth();
      sessionStorage.setItem('sessionStart', Date.now().toString());
    }
    
    const auth = getStoredAuth();
    console.log('[App] Stored auth:', auth);
    
    if (auth?.user) {
      console.log('[App] Setting user role:', auth.user.role);
      setUserRole(auth.user.role);
      setUserName(auth.user.name);
      setUserIsSuperAdmin(!!auth.user.isSuperAdmin);
    } else {
      console.log('[App] No auth found - showing login');
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

  if (!userRole) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <>
      {userRole === 'employee' ? (
        <Dashboard userName={userName} onLogout={handleLogout} />
      ) : (
        <AdminDashboard userName={userName} isSuperAdmin={userIsSuperAdmin} onLogout={handleLogout} />
      )}
    </>
  );
}
