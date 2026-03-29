import { useState, useEffect } from 'react';
import { Package, ClipboardList, Bell, LogOut, Plus, Menu, X, User, Wifi, WifiOff } from 'lucide-react';

export type EmployeeView = 'inventory' | 'requests' | 'history' | 'notifications';

interface InventoryItem {
  id: number;
  itemName: string;
  itemCode: string;
  quantity: number;
  unit: string;
  status: 'in-stock' | 'low-stock' | 'out-of-stock';
}

interface MaterialRequest {
  id: number;
  item_name: string;
  quantity_requested: string;
  unit: string;
  purpose: string;
  urgency: 'low' | 'normal' | 'high';
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  created_at: string;
  employee_name: string;
}

interface Notification {
  id: number;
  title: string;
  message: string;
  type: 'request_approved' | 'request_rejected' | 'new_inventory' | 'system_alert';
  is_read: boolean;
  created_at: string;
}

export function EmployeePortal() {
  const [view, setView] = useState<EmployeeView>('inventory');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'online' | 'offline'>('online');
  const [unreadCount, setUnreadCount] = useState(3);

  const handleLogout = () => {
    localStorage.removeItem('employee_token');
    window.location.href = '/employee/login';
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <div className={`bg-white border-r border-gray-200 transition-all duration-300 ${mobileMenuOpen ? 'w-64' : 'w-20'} flex flex-col`}>
        {/* Logo */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <img
              src="/kimoel-logo.png"
              alt="KIMOEL"
              className="h-8 w-auto object-contain"
            />
            {mobileMenuOpen && (
              <span style={{
                fontSize: '18px',
                fontWeight: '600',
                color: '#111827',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
              }}>
                EMPLOYEE
              </span>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {/* Inventory */}
          <button
            onClick={() => setView('inventory')}
            className={`w-full text-left rounded-lg transition-all duration-200 ${
              view === 'inventory' 
                ? 'bg-blue-50 border border-blue-200' 
                : 'hover:bg-gray-50 border border-transparent'
            }`}
            style={{
              padding: '12px 16px',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
            }}
          >
            <div className="flex items-center gap-3">
              <Package 
                style={{
                  width: '18px',
                  height: '18px',
                  color: view === 'inventory' ? '#2563eb' : '#6b7280'
                }} 
              />
              {mobileMenuOpen && (
                <span style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: view === 'inventory' ? '#2563eb' : '#111827'
                }}>
                  Inventory
                </span>
              )}
            </div>
          </button>

          {/* New Request */}
          <button
            onClick={() => setView('requests')}
            className={`w-full text-left rounded-lg transition-all duration-200 ${
              view === 'requests' 
                ? 'bg-blue-50 border border-blue-200' 
                : 'hover:bg-gray-50 border border-transparent'
            }`}
            style={{
              padding: '12px 16px',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
            }}
          >
            <div className="flex items-center gap-3">
              <Plus 
                style={{
                  width: '18px',
                  height: '18px',
                  color: view === 'requests' ? '#2563eb' : '#6b7280'
                }} 
              />
              {mobileMenuOpen && (
                <span style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: view === 'requests' ? '#2563eb' : '#111827'
                }}>
                  New Request
                </span>
              )}
            </div>
          </button>

          {/* My Requests */}
          <button
            onClick={() => setView('history')}
            className={`w-full text-left rounded-lg transition-all duration-200 ${
              view === 'history' 
                ? 'bg-blue-50 border border-blue-200' 
                : 'hover:bg-gray-50 border border-transparent'
            }`}
            style={{
              padding: '12px 16px',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
            }}
          >
            <div className="flex items-center gap-3">
              <ClipboardList 
                style={{
                  width: '18px',
                  height: '18px',
                  color: view === 'history' ? '#2563eb' : '#6b7280'
                }} 
              />
              {mobileMenuOpen && (
                <span style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: view === 'history' ? '#2563eb' : '#111827'
                }}>
                  My Requests
                </span>
              )}
            </div>
          </button>

          {/* Notifications */}
          <button
            onClick={() => setView('notifications')}
            className={`w-full text-left rounded-lg transition-all duration-200 ${
              view === 'notifications' 
                ? 'bg-blue-50 border border-blue-200' 
                : 'hover:bg-gray-50 border border-transparent'
            }`}
            style={{
              padding: '12px 16px',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
            }}
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <Bell 
                  style={{
                    width: '18px',
                    height: '18px',
                    color: view === 'notifications' ? '#2563eb' : '#6b7280'
                  }} 
                />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center" style={{ fontSize: '10px' }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              {mobileMenuOpen && (
                <span style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: view === 'notifications' ? '#2563eb' : '#111827'
                }}>
                  Notifications
                </span>
              )}
            </div>
          </button>
        </nav>

        {/* User Section */}
        <div className="border-t border-gray-200 p-3">
          {/* User Info */}
          <div className="flex items-center gap-3 p-2">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
              <User style={{ width: '16px', height: '16px', color: 'white' }} />
            </div>
            {mobileMenuOpen && (
              <span style={{
                fontSize: '14px',
                fontWeight: '400',
                color: '#6b7280',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
              }}>
                John Doe
              </span>
            )}
          </div>
          
          {/* Connection Status */}
          <div className="flex items-center gap-2 p-2">
            {connectionStatus === 'online' ? (
              <>
                <Wifi style={{ width: '14px', height: '14px', color: '#10b981' }} />
                {mobileMenuOpen && (
                  <span style={{
                    fontSize: '12px',
                    color: '#10b981',
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
                  }}>
                    Online
                  </span>
                )}
              </>
            ) : (
              <>
                <WifiOff style={{ width: '14px', height: '14px', color: '#ef4444' }} />
                {mobileMenuOpen && (
                  <span style={{
                    fontSize: '12px',
                    color: '#ef4444',
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
                  }}>
                    Offline
                  </span>
                )}
              </>
            )}
          </div>
          
          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="w-full text-left rounded-lg transition-all duration-200 hover:bg-gray-50 border border-transparent"
            style={{
              padding: '12px 16px',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
            }}
          >
            <div className="flex items-center gap-3">
              <LogOut 
                style={{
                  width: '18px',
                  height: '18px',
                  color: '#6b7280'
                }} 
              />
              {mobileMenuOpen && (
                <span style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#111827'
                }}>
                  Logout
                </span>
              )}
            </div>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
              </button>
              <h1 className="text-4xl font-black text-black tracking-tight">Employee Portal</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700">
                {new Date().toLocaleDateString()}
              </span>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
            
            {/* INVENTORY VIEW */}
            {view === 'inventory' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
                  <Package className="size-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-700 mb-2">Inventory View</h3>
                  <p className="text-slate-500">Professional design matching Admin Dashboard</p>
                </div>
              </div>
            )}

            {/* NEW REQUEST FORM */}
            {view === 'requests' && (
              <div className="max-w-2xl mx-auto">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
                  <Plus className="size-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-700 mb-2">New Request</h3>
                  <p className="text-slate-500">Material request form coming soon</p>
                </div>
              </div>
            )}

            {/* MY REQUESTS */}
            {view === 'history' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
                  <ClipboardList className="size-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-700 mb-2">My Requests</h3>
                  <p className="text-slate-500">Request history coming soon</p>
                </div>
              </div>
            )}

            {/* NOTIFICATIONS */}
            {view === 'notifications' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
                  <Bell className="size-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-700 mb-2">Notifications</h3>
                  <p className="text-slate-500">Notifications coming soon</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
