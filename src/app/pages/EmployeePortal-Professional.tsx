import { useState, useEffect } from 'react';
import { 
  Package, ClipboardList, Bell, LogOut, Plus, Clock, CheckCircle, 
  XCircle, Search, Filter, Menu, X, User, ChevronDown, 
  AlertCircle, TrendingUp, Archive, RefreshCw, Trash2, Edit2,
  Eye, Calendar, Tag, BarChart3, Wifi, WifiOff
} from 'lucide-react';
import { fetchApi } from '../api/client';
import { MobileCard } from '../components/MobileCard';
import { MobileButton } from '../components/MobileButton';
import { MobileInput } from '../components/MobileInput';
import { MobileSelect } from '../components/MobileSelect';
import { EmptyState } from '../components/EmptyState';
import { MobileBottomNav } from '../components/MobileBottomNav';
import { MobileTextarea } from '../components/MobileTextarea';

// Employee-specific fetch function
const fetchEmployeeApi = async (path: string, options?: RequestInit) => {
  const token = localStorage.getItem('employee_token');
  const headers = { 
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options?.headers 
  } as Record<string, string>;
  
  const fetchWithRetry = async (retries = 3, delay = 1000): Promise<Response> => {
    try {
      const res = await fetch(`/api${path}`, { ...options, headers });
      
      // Check if status is retryable
      const shouldRetry = [408, 429, 500, 502, 503, 504].includes(res.status);
      
      if (!res.ok && shouldRetry && retries > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchWithRetry(retries - 1, delay * 2);
      }
      
      return res;
    } catch (error) {
      // Network errors - retry
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchWithRetry(retries - 1, delay * 2);
      }
      throw error;
    }
  };
  
  const res = await fetchWithRetry();
  
  // Handle non-retryable errors
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
};

export type EmployeeView = 'inventory' | 'requests' | 'history' | 'notifications';

interface InventoryItem {
  id: number;
  itemName: string;
  itemCode: string;
  quantity: number;
  unit: string;
  status: 'in-stock' | 'low-stock' | 'out-of-stock';
  description?: string;
  category?: string;
  lastUpdated?: string;
  requestedCount?: number;
}

interface MaterialRequest {
  id: number;
  item_name: string;
  item_code?: string;
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

interface RequestForm {
  item_name: string;
  item_code: string;
  quantity_requested: string;
  unit: string;
  purpose: string;
  urgency: 'low' | 'normal' | 'high';
}

export function EmployeePortal() {
  const [view, setView] = useState<EmployeeView>('inventory');
  const [employee, setEmployee] = useState<any>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('newest');
  const [showFilters, setShowFilters] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'online' | 'offline'>('online');
  const [isMarkingRead, setIsMarkingRead] = useState<number | null>(null);
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);

  const [requestForm, setRequestForm] = useState<RequestForm>({
    item_name: '',
    item_code: '',
    quantity_requested: '',
    unit: '',
    purpose: '',
    urgency: 'normal',
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Helper functions
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'approved': return 'bg-green-50 text-green-700 border-green-200';
      case 'rejected': return 'bg-red-50 text-red-700 border-red-200';
      case 'completed': return 'bg-blue-50 text-blue-700 border-blue-200';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'request_approved': return CheckCircle;
      case 'request_rejected': return XCircle;
      case 'new_inventory': return Package;
      case 'system_alert': return AlertCircle;
      default: return Bell;
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'request_approved': return 'bg-green-100 text-green-600';
      case 'request_rejected': return 'bg-red-100 text-red-600';
      case 'new_inventory': return 'bg-blue-100 text-blue-600';
      case 'system_alert': return 'bg-orange-100 text-orange-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const markAsRead = async (id: number) => {
    setIsMarkingRead(id);
    try {
      await fetchEmployeeApi(`/notifications/${id}/read`, { method: 'POST' });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    } finally {
      setIsMarkingRead(null);
    }
  };

  const markAllAsRead = async () => {
    setIsMarkingAllRead(true);
    try {
      await fetchEmployeeApi('/notifications/read-all', { method: 'POST' });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    } finally {
      setIsMarkingAllRead(false);
    }
  };

  const handleSubmitRequest = async () => {
    // Validate form
    const errors: Record<string, string> = {};
    if (!requestForm.item_name.trim()) errors.item_name = 'Item name is required';
    if (!requestForm.quantity_requested.trim()) errors.quantity_requested = 'Quantity is required';
    if (!requestForm.unit.trim()) errors.unit = 'Unit is required';
    if (!requestForm.purpose.trim()) errors.purpose = 'Purpose is required';
    
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    
    setIsSubmitting(true);
    setFormErrors({});
    
    try {
      const result = await fetchEmployeeApi('/material-requests', {
        method: 'POST',
        body: JSON.stringify(requestForm)
      });
      
      setRequests(prev => [result, ...prev]);
      setRequestForm({
        item_name: '',
        item_code: '',
        quantity_requested: '',
        unit: '',
        purpose: '',
        urgency: 'normal',
      });
      setShowRequestModal(false);
      
      // Show success message
      alert('Material request submitted successfully!');
    } catch (error) {
      console.error('Failed to submit request:', error);
      alert('Failed to submit request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Data fetching
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [inventoryData, requestsData, notificationsData] = await Promise.all([
          fetchEmployeeApi('/inventory'),
          fetchEmployeeApi('/material-requests'),
          fetchEmployeeApi('/notifications')
        ]);
        
        setInventory(inventoryData || []);
        setRequests(requestsData || []);
        setNotifications(notificationsData || []);
        setUnreadCount(notificationsData?.filter((n: any) => !n.is_read).length || 0);
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    const employeeData = localStorage.getItem('employee_session');
    if (employeeData) {
      setEmployee(JSON.parse(employeeData));
    }

    loadData();
  }, []);

  // Connection status monitoring
  useEffect(() => {
    const checkConnection = () => {
      setConnectionStatus(navigator.onLine ? 'online' : 'offline');
    };
    
    window.addEventListener('online', checkConnection);
    window.addEventListener('offline', checkConnection);
    
    return () => {
      window.removeEventListener('online', checkConnection);
      window.removeEventListener('offline', checkConnection);
    };
  }, []);

  // Logout handler
  const handleLogout = () => {
    localStorage.removeItem('employee_token');
    localStorage.removeItem('employee_session');
    window.location.href = '/employee/login';
  };

  // Filter and sort functions
  const filteredInventory = inventory.filter(item =>
    item.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.itemCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.category?.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => {
    switch(sortBy) {
      case 'name': return a.itemName.localeCompare(b.itemName);
      case 'quantity': return b.quantity - a.quantity;
      case 'requested': return (b.requestedCount || 0) - (a.requestedCount || 0);
      default: return 0;
    }
  });

  const filteredRequests = requests.filter(request =>
    request.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    request.item_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    request.purpose.toLowerCase().includes(searchTerm.toLowerCase())
  ).filter(request => filterStatus === 'all' || request.status === filterStatus)
    .sort((a, b) => {
      switch(sortBy) {
        case 'newest': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'oldest': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'urgency': return b.urgency.localeCompare(a.urgency);
        default: return 0;
      }
    });

  // Group notifications by date
  const groupedNotifications = notifications.reduce((acc, notification) => {
    const date = new Date(notification.created_at).toLocaleDateString();
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(notification);
    return acc;
  }, {} as Record<string, Notification[]>);

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
                {employee?.full_name}
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
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-black text-black tracking-tight">Employee Portal</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700">
                {new Date().toLocaleDateString()}
              </span>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-auto">
          {/* Mobile Navigation Menu */}
          {!mobileMenuOpen && (
            <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-2">
              <div className="flex gap-2 overflow-x-auto">
                {[
                  { id: 'inventory', label: 'Inventory', icon: Package },
                  { id: 'requests', label: 'New Request', icon: Plus },
                  { id: 'history', label: 'My Requests', icon: ClipboardList },
                  { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadCount },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setView(tab.id as EmployeeView)}
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                      view === tab.id
                        ? 'bg-blue-50 text-blue-600 border border-blue-200'
                        : 'text-slate-600 hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <tab.icon className="size-4" />
                    <span>{tab.label}</span>
                    {tab.badge && tab.badge > 0 && (
                      <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        {tab.badge > 9 ? '9+' : tab.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* Main Content */}
          <div className="p-6">
            <div className="max-w-7xl mx-auto">
              
              {/* INVENTORY VIEW */}
              {view === 'inventory' && (
                <div className="space-y-6">
                  {/* Search and Filter Bar */}
                  <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex flex-col sm:flex-row gap-4">
                      {/* Search */}
                      <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 size-4" />
                        <input
                          type="text"
                          placeholder="Search inventory..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Inventory Grid */}
                  {filteredInventory.length === 0 ? (
                    <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
                      <Package className="size-12 text-slate-300 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-slate-700 mb-2">No items found</h3>
                      <p className="text-slate-500">Try adjusting your search criteria</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {filteredInventory.map(item => (
                        <MobileCard key={item.id}>
                          <div className="p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <h3 className="font-semibold text-slate-900 text-base mb-1">{item.itemName}</h3>
                                <p className="text-sm text-slate-500">Code: {item.itemCode}</p>
                              </div>
                              <span className={`px-2 py-1 text-xs font-medium rounded-full border ${
                                item.status === 'in-stock' ? 'bg-green-50 text-green-600 border-green-200' :
                                item.status === 'low-stock' ? 'bg-yellow-50 text-yellow-600 border-yellow-200' :
                                'bg-red-50 text-red-600 border-red-200'
                              }`}>
                                {item.status.replace('-', ' ')}
                              </span>
                            </div>
                            
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-2xl font-bold text-slate-900">{item.quantity}</span>
                              <span className="text-sm text-slate-500">{item.unit}</span>
                            </div>
                            
                            {item.requestedCount && item.requestedCount > 0 && (
                              <div className="bg-blue-50 rounded-lg p-2 mb-3">
                                <p className="text-xs text-blue-600 font-medium">
                                  {item.requestedCount} requested
                                </p>
                              </div>
                            )}
                            
                            <button
                              onClick={() => setSelectedItem(item)}
                              className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                            >
                              Request Item
                            </button>
                          </div>
                        </MobileCard>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* NEW REQUEST FORM */}
              {view === 'requests' && (
                <div className="max-w-2xl mx-auto">
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div className="p-6 border-b border-slate-200">
                      <h2 className="text-xl font-bold text-slate-900 mb-2">New Material Request</h2>
                      <p className="text-slate-600">Submit a request for materials or supplies</p>
                    </div>
                    
                    <div className="p-6">
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">Item Name</label>
                          <MobileInput
                            placeholder="Enter item name"
                            value={requestForm.item_name}
                            onChange={(value) => setRequestForm({...requestForm, item_name: value})}
                          />
                          {formErrors.item_name && (
                            <p className="text-red-500 text-xs mt-1">{formErrors.item_name}</p>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Item Code</label>
                            <MobileInput
                              placeholder="Item code (optional)"
                              value={requestForm.item_code}
                              onChange={(value) => setRequestForm({...requestForm, item_code: value})}
                              />
                              {formErrors.item_code && (
                                <p className="text-red-500 text-xs mt-1">{formErrors.item_code}</p>
                              )}
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Quantity</label>
                            <MobileInput
                              placeholder="Quantity"
                              value={requestForm.quantity_requested}
                              onChange={(value) => setRequestForm({...requestForm, quantity_requested: value})}
                              />
                              {formErrors.quantity_requested && (
                                <p className="text-red-500 text-xs mt-1">{formErrors.quantity_requested}</p>
                              )}
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Unit</label>
                            <MobileSelect
                              value={requestForm.unit}
                              onChange={(value) => setRequestForm({...requestForm, unit: value})}
                              options={[
                                { value: 'pcs', label: 'Pieces' },
                                { value: 'kg', label: 'Kilograms' },
                                { value: 'liters', label: 'Liters' },
                                { value: 'meters', label: 'Meters' },
                                { value: 'boxes', label: 'Boxes' }
                              ]}
                            />
                            {formErrors.unit && (
                              <p className="text-red-500 text-xs mt-1">{formErrors.unit}</p>
                            )}
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Urgency</label>
                            <MobileSelect
                              value={requestForm.urgency}
                              onChange={(value) => setRequestForm({...requestForm, urgency: value as 'low' | 'normal' | 'high'})}
                              options={[
                                { value: 'low', label: 'Low' },
                                { value: 'normal', label: 'Normal' },
                                { value: 'high', label: 'High' }
                              ]}
                            />
                            {formErrors.urgency && (
                              <p className="text-red-500 text-xs mt-1">{formErrors.urgency}</p>
                            )}
                          </div>
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">Purpose</label>
                          <MobileTextarea
                            placeholder="Describe the purpose of this request..."
                            value={requestForm.purpose}
                            onChange={(value) => setRequestForm({...requestForm, purpose: value})}
                            rows={3}
                          />
                          {formErrors.purpose && (
                            <p className="text-red-500 text-xs mt-1">{formErrors.purpose}</p>
                          )}
                        </div>
                        
                        <div className="flex gap-3">
                          <MobileButton
                            onClick={() => setView('inventory')}
                            variant="outline"
                            className="flex-1"
                          >
                            Cancel
                          </MobileButton>
                          <MobileButton
                            onClick={handleSubmitRequest}
                            disabled={isSubmitting}
                            className="flex-1"
                          >
                            {isSubmitting ? 'Submitting...' : 'Submit Request'}
                          </MobileButton>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* MY REQUESTS */}
              {view === 'history' && (
                <div className="space-y-6">
                  {/* Filter and Search Bar */}
                  <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 size-4" />
                        <input
                          type="text"
                          placeholder="Search requests..."
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      
                      <select className="px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="all">All Status</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>
                  </div>

                  {/* Requests List */}
                  {filteredRequests.length === 0 ? (
                    <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
                      <ClipboardList className="size-12 text-slate-300 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-slate-700 mb-2">No requests yet</h3>
                      <p className="text-slate-500 mb-4">Submit your first material request to get started</p>
                      <button
                        onClick={() => setView('requests')}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                      >
                        Create Request
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredRequests.map(request => (
                        <MobileCard key={request.id}>
                          <div className="p-4">
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                              <div className="flex-1">
                                <h3 className="font-semibold text-slate-900 text-base mb-1">{request.item_name}</h3>
                                <p className="text-sm text-slate-500">
                                  {request.quantity_requested} {request.unit} • Code: {request.item_code || 'N/A'}
                                </p>
                              </div>
                              <span className={`px-3 py-1 text-xs font-medium rounded-full border ${getStatusColor(request.status)}`}>
                                {request.status.replace('-', ' ')}
                              </span>
                            </div>
                            
                            <p className="text-sm text-slate-600 mb-4">{request.purpose}</p>
                            
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                              <div className="flex items-center gap-4 text-xs text-slate-500">
                                <div className="flex items-center gap-1">
                                  <Calendar className="size-3" />
                                  {new Date(request.created_at).toLocaleDateString()}
                                </div>
                                <div className="flex items-center gap-1">
                                  <User className="size-3" />
                                  {request.employee_name}
                                </div>
                              </div>
                              
                              {request.urgency === 'high' && (
                                <div className="flex items-center gap-1 text-red-500">
                                  <AlertCircle className="size-4" />
                                  <span className="text-xs font-medium">High Priority</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </MobileCard>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* NOTIFICATIONS */}
              {view === 'notifications' && (
                <div className="space-y-6">
                  <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold text-slate-900">Notifications</h2>
                      <button
                        onClick={markAllAsRead}
                        disabled={isMarkingAllRead}
                        className={`text-sm font-medium transition-all ${
                          isMarkingAllRead 
                            ? 'text-slate-400 cursor-not-allowed' 
                            : 'text-blue-600 hover:text-blue-700'
                        }`}
                      >
                        {isMarkingAllRead ? 'Marking...' : 'Mark all as read'}
                      </button>
                    </div>
                    
                    {notifications.length === 0 ? (
                      <div className="text-center py-8">
                        <Bell className="size-12 text-slate-300 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-slate-700 mb-2">No notifications</h3>
                        <p className="text-slate-500">You're all caught up!</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {notifications.map(notification => {
                          const Icon = getNotificationIcon(notification.type);
                          return (
                            <div
                              key={notification.id}
                              className={`bg-white rounded-xl border p-4 shadow-sm transition-all ${
                                isMarkingRead === notification.id
                                  ? 'opacity-50 cursor-not-allowed'
                                  : 'hover:shadow-md cursor-pointer'
                              } ${
                                !notification.is_read ? 'border-blue-200 bg-blue-50' : 'border-slate-200'
                              }`}
                              onClick={() => isMarkingRead === notification.id 
                                ? null 
                                : markAsRead(notification.id)}
                            >
                              <div className="flex gap-3">
                                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                                  notification.type === 'request_approved' ? 'bg-green-100 text-green-600' :
                                  notification.type === 'request_rejected' ? 'bg-red-100 text-red-600' :
                                  notification.type === 'new_inventory' ? 'bg-blue-100 text-blue-600' :
                                  'bg-gray-100 text-gray-600'
                                }`}>
                                  <Icon className="size-5" />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-start justify-between mb-1">
                                    <h4 className="font-semibold text-slate-900 text-sm">{notification.title}</h4>
                                    {!notification.is_read && (
                                      <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                                    )}
                                  </div>
                                  <p className="text-sm text-slate-600">{notification.message}</p>
                                  <p className="text-xs text-slate-400 mt-2">
                                    {new Date(notification.created_at).toLocaleDateString()} at {new Date(notification.created_at).toLocaleTimeString()}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        ));
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Bottom Navigation */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40">
          <div className="flex justify-around py-2">
            {[
              { id: 'inventory', label: 'Inventory', icon: Package },
              { id: 'requests', label: 'Request', icon: Plus },
              { id: 'history', label: 'History', icon: ClipboardList },
              { id: 'notifications', label: 'Alerts', icon: Bell, badge: unreadCount },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setView(tab.id as EmployeeView)}
                className={`flex flex-col items-center gap-1 p-2 min-w-0 transition-colors relative ${
                  view === tab.id
                    ? 'text-blue-600'
                    : 'text-slate-500'
                }`}
              >
                <tab.icon className="size-5" />
                <span className="text-xs">{tab.label}</span>
                {tab.badge && tab.badge > 0 && (
                  <span className="absolute top-1 right-2 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                    {tab.badge > 9 ? '9+' : tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
