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
  
  const res = await fetch(`/api${path}`, { ...options, headers });
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

  const [requestForm, setRequestForm] = useState<RequestForm>({
    item_name: '',
    item_code: '',
    quantity_requested: '1',
    unit: 'pcs',
    purpose: '',
    urgency: 'normal'
  });

  const [formErrors, setFormErrors] = useState<Partial<RequestForm>>({});

  // API Functions
  const fetchInventoryData = async () => {
    try {
      const data = await fetchEmployeeApi('/inventory');
      
      // Transform database data to match interface
      const transformedData: InventoryItem[] = (Array.isArray(data) ? data : []).map((item: any) => ({
        id: item.id,
        itemName: item.itemName,
        itemCode: item.itemCode,
        quantity: item.quantity,
        unit: item.unit,
        status: item.quantity > 20 ? 'in-stock' : item.quantity > 0 ? 'low-stock' : 'out-of-stock',
        description: item.description,
        category: item.location || 'General',
        lastUpdated: new Date().toLocaleDateString(),
        requestedCount: 0 // TODO: Add request count from material_requests table
      }));
      
      setInventory(transformedData);
    } catch (error) {
            setInventory([]);
    }
  };

  const fetchNotifications = async () => {
    try {
      if (!employee) return;
      
      const data = await fetchEmployeeApi(`/employee/${employee.id}/notifications`);
      
      // Transform database data to match interface
      const transformedData: Notification[] = (Array.isArray(data) ? data : []).map((notif: any) => ({
        id: notif.id,
        title: notif.title,
        message: notif.message,
        type: notif.type,
        is_read: notif.is_read,
        created_at: notif.created_at
      }));
      
      setNotifications(transformedData);
      setUnreadCount(transformedData.filter(n => !n.is_read).length);
    } catch (error) {
      setNotifications([]);
    }
  };

  const fetchUserRequests = async () => {
    try {
      if (!employee) return;
      
      const data = await fetchEmployeeApi(`/material-requests/employee/${employee.id}`);
      
      // Transform database data to match interface
      const transformedData: MaterialRequest[] = (Array.isArray(data) ? data : []).map((req: any) => ({
        id: req.id,
        item_name: req.item_name,
        item_code: req.item_code,
        quantity_requested: req.quantity_requested.toString(),
        unit: req.unit,
        purpose: req.purpose,
        urgency: req.urgency,
        status: req.status,
        created_at: req.created_at,
        employee_name: req.employee_name
      }));
      
      setRequests(transformedData);
    } catch (error) {
      setRequests([]);
    }
  };

  useEffect(() => {
    const stored = localStorage.getItem('employee_session');
    if (!stored) {
      window.location.href = '/employee/login';
      return;
    }
    
    const session = JSON.parse(stored);
    setEmployee(session);
    
    // Fetch real data from API
    fetchInventoryData();
    setIsLoading(false);

    // Check connection status
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

  // Fetch notifications and requests when employee is set
  useEffect(() => {
    if (employee) {
      fetchNotifications();
      fetchUserRequests();
    }
  }, [employee]);

  const validateForm = (): boolean => {
    const errors: Partial<RequestForm> = {};
    
    if (!requestForm.item_name.trim()) {
      errors.item_name = 'Item name is required';
    }
    
        
        
    if (parseInt(requestForm.quantity_requested) < 1) {
      errors.quantity_requested = 'Quantity must be at least 1';
    }
    
    if (!requestForm.purpose.trim()) {
      errors.purpose = 'Purpose is required';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmitRequest = async () => {
    if (!validateForm() || !employee) return;
    
    setIsSubmitting(true);
    try {
      // Real API call with authentication
      await fetchEmployeeApi('/material-requests', {
        method: 'POST',
        body: JSON.stringify({
          item_name: requestForm.item_name,
          item_code: requestForm.item_code,
          quantity_requested: parseInt(requestForm.quantity_requested),
          unit: requestForm.unit,
          purpose: requestForm.purpose,
          urgency: requestForm.urgency,
          employee_id: employee.id,
          employee_name: employee.full_name
        })
      });
      
      // Refresh requests list
      await fetchUserRequests();
      
      setShowRequestModal(false);
      setRequestForm({
        item_name: '',
        item_code: '',
        quantity_requested: '1',
        unit: 'pcs',
        purpose: '',
        urgency: 'normal'
      });
      setFormErrors({});
      
      // Show success message
      alert('Request submitted successfully!');
    } catch (error) {
      alert('Failed to submit request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('employee_session');
    localStorage.removeItem('employee_token');
    window.location.href = '/employee/login';
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'approved': 
        return 'bg-green-100 text-green-700 border-green-200';
      case 'rejected': 
        return 'bg-red-100 text-red-700 border-red-200';
      case 'completed':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      default: 
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    }
  };

  const getNotificationIcon = (type: string) => {
    switch(type) {
      case 'request_approved': return CheckCircle;
      case 'request_rejected': return XCircle;
      case 'new_inventory': return Package;
      case 'system_alert': return AlertCircle;
      default: return Bell;
    }
  };

  const getNotificationColor = (type: string) => {
    switch(type) {
      case 'request_approved': return 'text-green-600';
      case 'request_rejected': return 'text-red-600';
      case 'new_inventory': return 'text-blue-600';
      case 'system_alert': return 'text-amber-600';
      default: return 'text-slate-600';
    }
  };

  const filteredInventory = inventory.filter(item =>
    item.itemName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.itemCode?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sortedInventory = [...filteredInventory].sort((a, b) => {
    switch(sortBy) {
      case 'name': return a.itemName.localeCompare(b.itemName);
      case 'quantity': return b.quantity - a.quantity;
      case 'requested': return (b.requestedCount || 0) - (a.requestedCount || 0);
      default: return 0;
    }
  });

  const filteredRequests = requests.filter(request => 
    filterStatus === 'all' || request.status === filterStatus
  );

  const groupedNotifications = notifications.reduce((groups, notification) => {
    const date = new Date(notification.created_at).toDateString();
    if (!groups[date]) groups[date] = [];
    groups[date].push(notification);
    return groups;
  }, {} as Record<string, Notification[]>);

  const SkeletonLoader = () => (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
          <div className="flex justify-between items-start mb-2">
            <div className="flex-1">
              <div className="h-5 bg-slate-200 rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-slate-200 rounded w-1/2"></div>
            </div>
            <div className="h-6 bg-slate-200 rounded w-16"></div>
          </div>
          <div className="h-4 bg-slate-200 rounded w-full mb-3"></div>
          <div className="flex justify-between items-center">
            <div className="h-4 bg-slate-200 rounded w-20"></div>
            <div className="h-8 bg-slate-200 rounded w-20"></div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-slate-900 text-white px-4 py-3 mobile:px-3 sticky top-0 z-50 shadow-lg sm:px-6 sm:py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-3 rounded-lg hover:bg-slate-700 transition-colors"
              style={{ minHeight: '44px', minWidth: '44px' }}
            >
              {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
            
            <div>
              <p className="text-xs text-slate-400 font-medium mobile:text-xs sm:text-sm">KIMOEL EMPLOYEE PORTAL</p>
              <p className="font-semibold text-sm mobile:text-sm sm:text-base">{employee?.full_name}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Connection status */}
            <div className="hidden sm:flex items-center gap-1 text-xs">
              {connectionStatus === 'online' ? (
                <>
                  <Wifi className="size-3 text-green-400" />
                  <span className="text-green-400">Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="size-3 text-red-400" />
                  <span className="text-red-400">Offline</span>
                </>
              )}
            </div>
            
            {/* User menu */}
            <div className="relative">
              <button 
                onClick={handleLogout}
                className="flex items-center gap-2 p-3 rounded-lg hover:bg-slate-700 transition-colors"
                style={{ minHeight: '44px', minWidth: '44px' }}
              >
                <div className="w-6 h-6 bg-slate-600 rounded-full flex items-center justify-center">
                  <User className="size-3" />
                </div>
                <ChevronDown className="size-4 hidden sm:block" />
              </button>
            </div>
            
            {/* Logout button */}
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
              title="Logout"
            >
              <LogOut className="size-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white border-b border-slate-200 shadow-lg">
          <nav className="px-4 py-2">
            {[
              { id: 'inventory', label: 'Inventory', icon: Package },
              { id: 'requests', label: 'New Request', icon: Plus },
              { id: 'history', label: 'My Requests', icon: ClipboardList },
              { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadCount },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setView(tab.id as EmployeeView);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-3 text-sm font-medium rounded-lg transition-colors relative ${
                  view === tab.id
                    ? 'bg-blue-50 text-blue-600 border-l-4 border-blue-600'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <tab.icon className="size-5" />
                <span>{tab.label}</span>
                {tab.badge && tab.badge > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      )}

      {/* Desktop Navigation Tabs */}
      <div className="hidden lg:block bg-white border-b border-slate-200">
        <div className="px-4 flex gap-1 overflow-x-auto">
          {[
            { id: 'inventory', label: 'Inventory', icon: Package },
            { id: 'requests', label: 'New Request', icon: Plus },
            { id: 'history', label: 'My Requests', icon: ClipboardList },
            { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadCount },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id as EmployeeView)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors relative ${
                view === tab.id
                  ? 'border-blue-600 text-blue-600 bg-blue-50'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <tab.icon className="size-4" />
              <span>{tab.label}</span>
              {tab.badge && tab.badge > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
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
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <main className="px-4 py-6 pb-20 mobile:px-3 mobile:py-4 mobile:pb-20 sm:px-6 sm:py-8 sm:pb-8 lg:px-8 lg:py-6 lg:pb-8">
        <div className="max-w-7xl mx-auto">
          
          {/* INVENTORY VIEW */}
          {view === 'inventory' && (
            <div className="space-y-6">
              {/* Search and Filter Bar */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Search */}
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 size-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search inventory..."
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                  </div>
                  
                  {/* Filter Button */}
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                  >
                    <Filter className="size-4" />
                    <span className="hidden sm:inline">Filters</span>
                  </button>
                  
                  {/* Sort Dropdown */}
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value)}
                    className="px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="newest">Newest First</option>
                    <option value="name">Name A-Z</option>
                    <option value="quantity">High Quantity</option>
                    <option value="requested">Most Requested</option>
                  </select>
                </div>
                
                {/* Expanded Filters */}
                {showFilters && (
                  <div className="mt-4 pt-4 border-t border-slate-200">
                    <div className="flex flex-wrap gap-2">
                      {['all', 'in-stock', 'low-stock', 'out-of-stock'].map(status => (
                        <button
                          key={status}
                          onClick={() => setFilterStatus(status)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                            filterStatus === status
                              ? 'bg-blue-100 text-blue-700 border-blue-200'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {status === 'all' ? 'All Items' : status.replace('-', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Inventory Grid */}
              {isLoading ? (
                <SkeletonLoader />
              ) : sortedInventory.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
                  <Package className="size-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-700 mb-2">No items found</h3>
                  <p className="text-slate-500">Try adjusting your search or filters</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 mobile:grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mobile:gap-4">
                  {sortedInventory.map(item => (
                    <MobileCard key={item.id}>
                      {/* Status Badge */}
                      <div className="p-4 pb-0">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <h3 className="font-semibold text-slate-900 text-base mb-1">{item.itemName}</h3>
                            <p className="text-sm text-slate-500">{item.itemCode}</p>
                          </div>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full border ${
                            item.status === 'in-stock' 
                              ? 'bg-green-100 text-green-700 border-green-200'
                              : item.status === 'low-stock'
                              ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
                              : 'bg-red-100 text-red-700 border-red-200'
                          }`}>
                            {item.status.replace('-', ' ')}
                          </span>
                        </div>
                        
                        {item.description && (
                          <p className="text-sm text-slate-600 mb-3 line-clamp-2">{item.description}</p>
                        )}
                        
                        {/* Item Details */}
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <div className="bg-slate-50 rounded-lg p-3">
                            <p className="text-xs text-slate-500 mb-1">Quantity</p>
                            <p className="font-semibold text-slate-900">{item.quantity} {item.unit}</p>
                          </div>
                          <div className="bg-slate-50 rounded-lg p-3">
                            <p className="text-xs text-slate-500 mb-1">Requested</p>
                            <p className="font-semibold text-slate-900">{item.requestedCount || 0} times</p>
                          </div>
                        </div>
                        
                        {/* Action Button */}
                        <button
                          onClick={() => {
                            setSelectedItem(item);
                            setRequestForm(f => ({
                              ...f,
                              item_name: item.itemName,
                              item_code: item.itemCode,
                              unit: item.unit
                            }));
                            setShowRequestModal(true);
                          }}
                          disabled={item.status === 'out-of-stock'}
                          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-colors ${
                            item.status === 'out-of-stock'
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
                          }`}
                        >
                          <Plus className="size-4" />
                          {item.status === 'out-of-stock' ? 'Out of Stock' : 'Request Item'}
                        </button>
                      </div>
                      
                      {/* Footer */}
                      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200">
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>Category: {item.category || 'General'}</span>
                          <span>Updated: {item.lastUpdated || 'N/A'}</span>
                        </div>
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
                  <h2 className="text-xl font-bold text-slate-900">Submit Material Request</h2>
                  <p className="text-sm text-slate-600 mt-1">Fill out the form below to request materials</p>
                </div>
                
                <form onSubmit={e => { e.preventDefault(); handleSubmitRequest(); }} className="p-6 space-y-6">
                  {/* Item Name */}
                  <MobileInput
                    label="Item Name"
                    required
                    type="text"
                    placeholder="Enter item name"
                    value={requestForm.item_name}
                    onChange={value => setRequestForm(f => ({ ...f, item_name: value }))}
                    error={formErrors.item_name}
                  />

                  {/* Item Code */}
                  <MobileInput
                    label="Item Code"
                    type="text"
                    placeholder="Optional item code"
                    value={requestForm.item_code}
                    onChange={value => setRequestForm(f => ({ ...f, item_code: value }))}
                  />

                  {/* Quantity and Unit */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <MobileInput
                      label="Quantity"
                      required
                      type="number"
                      placeholder="1"
                      min="1"
                      value={requestForm.quantity_requested}
                      onChange={value => setRequestForm(f => ({ ...f, quantity_requested: value }))}
                      error={formErrors.quantity_requested}
                    />
                    
                    <MobileSelect
                      label="Unit"
                      required
                      value={requestForm.unit}
                      onChange={value => setRequestForm(f => ({ ...f, unit: value }))}
                      options={[
                        { value: 'pcs', label: 'Pieces' },
                        { value: 'kg', label: 'Kilograms' },
                        { value: 'm', label: 'Meters' },
                        { value: 'l', label: 'Liters' },
                        { value: 'box', label: 'Box' },
                        { value: 'set', label: 'Set' }
                      ]}
                    />
                  </div>

                  {/* Purpose */}
                  <MobileTextarea
                    label="Purpose"
                    required
                    placeholder="Describe the purpose of this request"
                    value={requestForm.purpose}
                    onChange={value => setRequestForm(f => ({ ...f, purpose: value }))}
                    error={formErrors.purpose}
                  />

                  {/* Urgency */}
                  <MobileSelect
                    label="Urgency"
                    value={requestForm.urgency}
                    onChange={value => setRequestForm(f => ({ ...f, urgency: value as any }))}
                    options={[
                      { value: 'low', label: 'Low Priority' },
                      { value: 'normal', label: 'Normal' },
                      { value: 'high', label: 'High Priority' }
                    ]}
                  />

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-4">
                    <MobileButton
                      variant="secondary"
                      onClick={() => {
                        setRequestForm({
                          item_name: '',
                          item_code: '',
                          quantity_requested: '1',
                          unit: 'pcs',
                          purpose: '',
                          urgency: 'normal'
                        });
                        setFormErrors({});
                      }}
                    >
                      Clear
                    </MobileButton>
                    <MobileButton
                      variant="primary"
                      type="submit"
                      loading={isSubmitting}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Submitting...' : 'Submit Request'}
                    </MobileButton>
                  </div>
                </form>
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
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 size-4 text-slate-400" />
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
                              <span>{new Date(request.created_at).toLocaleDateString()}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Tag className="size-3" />
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                request.urgency === 'high' ? 'bg-red-100 text-red-700' :
                                request.urgency === 'normal' ? 'bg-blue-100 text-blue-700' :
                                'bg-green-100 text-green-700'
                              }`}>
                                {request.urgency}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex gap-2">
                            {request.status === 'pending' && (
                              <button className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                                Cancel
                              </button>
                            )}
                            {request.status === 'rejected' && (
                              <button className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">
                                Resubmit
                              </button>
                            )}
                            <button className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                              View Details
                            </button>
                          </div>
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
              {/* Header with Actions */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-900">Notifications</h2>
                  <div className="flex gap-2">
                    <button className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                      Mark All Read
                    </button>
                    <button className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                      Clear All
                    </button>
                  </div>
                </div>
              </div>

              {/* Notifications List */}
              {Object.keys(groupedNotifications).length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
                  <Bell className="size-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-700 mb-2">No notifications yet</h3>
                  <p className="text-slate-500">You're all caught up! Check back later for updates.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.entries(groupedNotifications).map(([date, dayNotifications]) => (
                    <div key={date}>
                      <h3 className="text-sm font-medium text-slate-500 mb-3 px-1">
                        {date === new Date().toDateString() ? 'Today' : 
                         date === new Date(Date.now() - 86400000).toDateString() ? 'Yesterday' : 
                         date}
                      </h3>
                      
                      <div className="space-y-3">
                        {dayNotifications.map(notification => {
                          const Icon = getNotificationIcon(notification.type);
                          return (
                            <div
                              key={notification.id}
                              className={`bg-white rounded-xl border p-4 shadow-sm hover:shadow-md transition-all cursor-pointer ${
                                !notification.is_read ? 'border-blue-200 bg-blue-50' : 'border-slate-200'
                              }`}
                            >
                              <div className="flex gap-4">
                                <div className={`p-2 rounded-lg ${
                                  !notification.is_read ? 'bg-blue-100' : 'bg-slate-100'
                                }`}>
                                  <Icon className={`size-5 ${getNotificationColor(notification.type)}`} />
                                </div>
                                
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-semibold text-slate-900 text-sm mb-1">{notification.title}</h4>
                                  <p className="text-sm text-slate-600 mb-2">{notification.message}</p>
                                  <p className="text-xs text-slate-500">
                                    {new Date(notification.created_at).toLocaleTimeString()}
                                  </p>
                                </div>
                                
                                {!notification.is_read && (
                                  <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0 mt-2"></div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Quick Request</h3>
            <p className="text-sm text-slate-600 mb-4">
              Requesting: {selectedItem?.itemName}
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Quantity</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  value={requestForm.quantity_requested}
                  onChange={e => setRequestForm(f => ({ ...f, quantity_requested: e.target.value }))}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Purpose</label>
                <textarea
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none"
                  rows={3}
                  placeholder="Why do you need this item?"
                  value={requestForm.purpose}
                  onChange={e => setRequestForm(f => ({ ...f, purpose: e.target.value }))}
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowRequestModal(false)}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitRequest}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav 
        view={view} 
        setView={setView} 
        unreadCount={unreadCount} 
      />
    </div>
  );
}
