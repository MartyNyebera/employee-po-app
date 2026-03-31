import { useState, useEffect } from 'react';
import { Package, ClipboardList, Bell, LogOut, Menu, X, User, Wifi, WifiOff, AlertCircle, FileText, Clock, Search } from 'lucide-react';
import ErrorBoundary from '../components/ErrorBoundary';
import { PageErrorFallback } from '../components/PageErrorFallback';

export type EmployeeView = 'inventory' | 'requests' | 'history' | 'notifications';

interface InventoryItem {
  id: number;
  itemName: string;
  itemCode: string;
  quantity: number;
  unit: string;
  status: 'in-stock' | 'low-stock' | 'out-of-stock';
  location?: string;
  description?: string;
  reorderLevel?: number;
}

interface RequestForm {
  item_name: string;
  item_code: string;
  quantity_requested: string;
  unit: string;
  purpose: string;
  urgency: 'low' | 'normal' | 'high';
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

const NAV_ITEMS = [
  { id: 'inventory'     as EmployeeView, label: 'Inventory',     icon: Package },
  { id: 'requests'      as EmployeeView, label: 'New Request',   icon: FileText },
  { id: 'history'       as EmployeeView, label: 'My Requests',   icon: ClipboardList },
  { id: 'notifications' as EmployeeView, label: 'Notifications', icon: Bell },
];

function SidebarInner({ view, setView, setMobileMenuOpen, unreadCount, employee, connectionStatus, handleLogout }: {
  view: EmployeeView;
  setView: (v: EmployeeView) => void;
  setMobileMenuOpen: (v: boolean) => void;
  unreadCount: number;
  employee: any;
  connectionStatus: string;
  handleLogout: () => void;
}) {
  return (
    <div className="bg-white flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200">
        <img src="/kimoel-logo.png" alt="Logo" className="h-8 w-auto object-contain" />
        <span className="text-base font-black tracking-wide text-gray-900">EMPLOYEE</span>
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = view === id;
          return (
            <button
              key={id}
              onClick={() => { setView(id); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium focus:outline-none transition-colors ${
                active
                  ? 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-700'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-100'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{label}</span>
              {id === 'notifications' && unreadCount > 0 && (
                <span className={`ml-auto text-xs font-semibold rounded-full px-1.5 py-0.5 ${active ? 'bg-white/30 text-white' : 'bg-red-100 text-red-600'}`}>
                  {unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="border-t border-gray-200 px-3 py-3 space-y-1">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {employee?.full_name || employee?.email || 'Employee'}
            </p>
            <div className="flex items-center gap-1 mt-0.5">
              {connectionStatus === 'online'
                ? <><Wifi className="w-3 h-3 text-emerald-500" /><span className="text-xs text-emerald-600">Online</span></>
                : <><WifiOff className="w-3 h-3 text-red-500" /><span className="text-xs text-red-500">Offline</span></>
              }
            </div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );
}

export function EmployeePortal() {
  const [view, setView] = useState<EmployeeView>('inventory');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'online' | 'offline'>('online');
  const [unreadCount, setUnreadCount] = useState(0);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in-stock' | 'low-stock' | 'out-of-stock'>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [employee, setEmployee] = useState<any>(null);
  const [requestForm, setRequestForm] = useState<RequestForm>({
    item_name: '', item_code: '', quantity_requested: '', unit: '', purpose: '', urgency: 'normal',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const fetchApi = async (path: string, options?: RequestInit) => {
    const token = localStorage.getItem('employee_token');
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options?.headers,
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
      throw new Error(`EmployeePortal API request failed for ${path}: ${err.error || `HTTP ${res.status}`}`);
    }
    return res.json();
  };

  const getRequestStatusColor = (status: string) => {
    switch (status) {
      case 'pending':   return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'approved':  return 'bg-green-50 text-green-700 border-green-200';
      case 'rejected':  return 'bg-red-50 text-red-700 border-red-200';
      case 'completed': return 'bg-blue-50 text-blue-700 border-blue-200';
      default:          return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const getStockBadge = (status: string) => {
    switch (status) {
      case 'in-stock':     return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'low-stock':    return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'out-of-stock': return 'bg-red-50 text-red-600 border-red-200';
      default:             return 'bg-gray-50 text-gray-600 border-gray-200';
    }
  };

  const handleSubmitRequest = async () => {
    const errors: Record<string, string> = {};
    if (!requestForm.item_name.trim()) errors.item_name = 'Required';
    if (!requestForm.quantity_requested.trim()) errors.quantity_requested = 'Required';
    if (!requestForm.unit.trim()) errors.unit = 'Required';
    if (!requestForm.purpose.trim()) errors.purpose = 'Required';
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setIsSubmitting(true);
    setFormErrors({});
    try {
      const result = await fetchApi('/material-requests', {
        method: 'POST',
        body: JSON.stringify({
          ...requestForm,
          employee_id: employee?.id || 1,
          employee_name: employee?.full_name || employee?.email || 'Unknown',
        }),
      });
      setRequests(prev => [result, ...prev]);
      setRequestForm({ item_name: '', item_code: '', quantity_requested: '', unit: '', purpose: '', urgency: 'normal' });
      setSelectedItem(null);
      setView('history');
      alert('Request submitted successfully!');
    } catch (err) {
      alert('Failed to submit request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('employee_token');
    localStorage.removeItem('employee_session');
    window.location.href = '/employee/login';
  };

  useEffect(() => {
    const loadData = async (empId: number) => {
      setIsLoading(true);
      try {
        const [invData, reqData] = await Promise.all([
          fetchApi('/inventory'),
          fetchApi(`/material-requests/employee/${empId}`),
        ]);
        const withStatus = (invData || []).map((item: any) => ({
          ...item,
          status: item.quantity <= 0
            ? 'out-of-stock'
            : item.quantity <= (item.reorderLevel || 0)
            ? 'low-stock'
            : 'in-stock',
        }));
        setInventory(withStatus);
        setRequests(reqData || []);
      } catch (e) {
        console.error('Failed to load data:', e);
      } finally {
        setIsLoading(false);
      }
    };
    const saved = localStorage.getItem('employee_session');
    if (saved) {
      const parsed = JSON.parse(saved);
      setEmployee(parsed);
      loadData(parsed?.id || 1);
    } else {
      loadData(1);
    }
  }, []);

  useEffect(() => {
    const check = () => setConnectionStatus(navigator.onLine ? 'online' : 'offline');
    window.addEventListener('online', check);
    window.addEventListener('offline', check);
    return () => { window.removeEventListener('online', check); window.removeEventListener('offline', check); };
  }, []);

  const uniqueLocations = Array.from(new Set(inventory.map(i => i.location || '').filter(Boolean)));

  const filteredInventory = inventory.filter(item => {
    const s = searchTerm.toLowerCase();
    const matchSearch = !s || item.itemName.toLowerCase().includes(s) || item.itemCode.toLowerCase().includes(s);
    const matchStock = stockFilter === 'all' || item.status === stockFilter;
    const matchLoc = locationFilter === 'all' || item.location === locationFilter;
    return matchSearch && matchStock && matchLoc;
  });

  const sidebarProps = { view, setView, setMobileMenuOpen, unreadCount, employee, connectionStatus, handleLogout };

  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
      <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* Mobile overlay — sits above content, below sidebar */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar — fixed on mobile, static on desktop */}
      <div className={`
        flex-shrink-0 w-64 z-30
        lg:relative lg:flex lg:flex-col
        ${mobileMenuOpen ? 'fixed inset-y-0 left-0 flex flex-col' : 'hidden lg:flex lg:flex-col'}
      `}>
        <SidebarInner {...sidebarProps} />
      </div>

      {/* Main — always takes remaining space, never overlaps sidebar on desktop */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <header className="flex-shrink-0 flex items-center justify-between bg-white border-b border-gray-200 px-4 lg:px-6 h-14">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <h1 className="text-lg font-bold text-gray-900">
              {NAV_ITEMS.find(n => n.id === view)?.label ?? 'Employee Portal'}
            </h1>
          </div>
          <span className="text-xs text-gray-400 hidden sm:block">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
          </span>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">

          {/* INVENTORY */}
          {view === 'inventory' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search inventory..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <select
                  value={stockFilter}
                  onChange={e => setStockFilter(e.target.value as any)}
                  className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Stock</option>
                  <option value="in-stock">In Stock</option>
                  <option value="low-stock">Low Stock</option>
                  <option value="out-of-stock">Out of Stock</option>
                </select>
                <select
                  value={locationFilter}
                  onChange={e => setLocationFilter(e.target.value)}
                  className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Locations</option>
                  {uniqueLocations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                </select>
                {(searchTerm || stockFilter !== 'all' || locationFilter !== 'all') && (
                  <button
                    onClick={() => { setSearchTerm(''); setStockFilter('all'); setLocationFilter('all'); }}
                    className="px-3 py-2 text-sm text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                  >Clear</button>
                )}
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading inventory…</div>
              ) : filteredInventory.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                  <Package className="w-10 h-10 mb-3 text-gray-300" />
                  <p className="font-medium text-gray-500">No items found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                  {filteredInventory.map(item => (
                    <div key={item.id} className="bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-shadow flex flex-col">
                      <div className="p-4 flex-1">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-gray-900 text-sm truncate">{item.itemName}</h3>
                            <p className="text-xs text-gray-400 mt-0.5">{item.itemCode}</p>
                          </div>
                          <span className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border ${getStockBadge(item.status ?? '')}`}>
                            {(item.status ?? 'unknown').replace(/-/g, ' ')}
                          </span>
                        </div>
                        <div className="flex items-end gap-1 mb-1">
                          <span className="text-2xl font-bold text-gray-900">{item.quantity}</span>
                          <span className="text-sm text-gray-400 mb-0.5">{item.unit}</span>
                        </div>
                        {item.location && <p className="text-xs text-gray-400">{item.location}</p>}
                      </div>
                      <div className="px-4 pb-4">
                        <button
                          onClick={() => {
                            setSelectedItem(item);
                            setRequestForm({ item_name: item.itemName, item_code: item.itemCode, quantity_requested: '', unit: item.unit, purpose: '', urgency: 'normal' });
                            setView('requests');
                          }}
                          disabled={item.status === 'out-of-stock'}
                          className="w-full py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {item.status === 'out-of-stock' ? 'Out of Stock' : 'Request Item'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* NEW REQUEST */}
          {view === 'requests' && (
            <div className="max-w-xl mx-auto">
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h2 className="font-bold text-gray-900">New Material Request</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Fill in the details below to submit your request</p>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Item Name <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={requestForm.item_name}
                      onChange={e => setRequestForm({ ...requestForm, item_name: e.target.value })}
                      placeholder="Enter item name"
                      className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErrors.item_name ? 'border-red-400' : 'border-gray-200'}`}
                    />
                    {formErrors.item_name && <p className="text-red-500 text-xs mt-1">{formErrors.item_name}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Item Code</label>
                      <input
                        type="text"
                        value={requestForm.item_code}
                        onChange={e => setRequestForm({ ...requestForm, item_code: e.target.value })}
                        placeholder="Optional"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Quantity <span className="text-red-500">*</span></label>
                      <input
                        type="number"
                        min="1"
                        value={requestForm.quantity_requested}
                        onChange={e => setRequestForm({ ...requestForm, quantity_requested: e.target.value })}
                        placeholder="0"
                        className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErrors.quantity_requested ? 'border-red-400' : 'border-gray-200'}`}
                      />
                      {formErrors.quantity_requested && <p className="text-red-500 text-xs mt-1">{formErrors.quantity_requested}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Unit <span className="text-red-500">*</span></label>
                      <select
                        value={requestForm.unit}
                        onChange={e => setRequestForm({ ...requestForm, unit: e.target.value })}
                        className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${formErrors.unit ? 'border-red-400' : 'border-gray-200'}`}
                      >
                        <option value="">Select unit</option>
                        <option value="pcs">Pieces</option>
                        <option value="kg">Kilograms</option>
                        <option value="liters">Liters</option>
                        <option value="meters">Meters</option>
                        <option value="boxes">Boxes</option>
                        <option value="sets">Sets</option>
                      </select>
                      {formErrors.unit && <p className="text-red-500 text-xs mt-1">{formErrors.unit}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Urgency</label>
                      <select
                        value={requestForm.urgency}
                        onChange={e => setRequestForm({ ...requestForm, urgency: e.target.value as any })}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Purpose <span className="text-red-500">*</span></label>
                    <textarea
                      value={requestForm.purpose}
                      onChange={e => setRequestForm({ ...requestForm, purpose: e.target.value })}
                      placeholder="Describe the purpose of this request…"
                      rows={3}
                      className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${formErrors.purpose ? 'border-red-400' : 'border-gray-200'}`}
                    />
                    {formErrors.purpose && <p className="text-red-500 text-xs mt-1">{formErrors.purpose}</p>}
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => { setView('inventory'); setSelectedItem(null); setFormErrors({}); }}
                      className="flex-1 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
                    >Cancel</button>
                    <button
                      onClick={handleSubmitRequest}
                      disabled={isSubmitting}
                      className="flex-1 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >{isSubmitting ? 'Submitting…' : 'Submit Request'}</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MY REQUESTS */}
          {view === 'history' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">My Requests</h2>
                <span className="text-sm text-gray-400">{requests.length} total</span>
              </div>
              {requests.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                  <ClipboardList className="w-10 h-10 mb-3 text-gray-300" />
                  <p className="font-medium text-gray-500">No requests yet</p>
                  <button onClick={() => setView('requests')} className="mt-3 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Create Request
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {requests.map(req => (
                    <div key={req.id} className="bg-white rounded-xl border border-gray-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 text-sm">{req.item_name}</h3>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {req.quantity_requested} {req.unit}{req.item_code ? ` · ${req.item_code}` : ''}
                          </p>
                        </div>
                        <span className={`flex-shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border ${getRequestStatusColor(req.status)}`}>
                          {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                        </span>
                      </div>
                      {req.purpose && <p className="text-sm text-gray-600 mt-2 line-clamp-2">{req.purpose}</p>}
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-3 text-xs text-gray-400">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(req.created_at).toLocaleDateString()}</span>
                          <span className="flex items-center gap-1"><User className="w-3 h-3" />{req.employee_name}</span>
                        </div>
                        {req.urgency === 'high' && (
                          <span className="flex items-center gap-1 text-xs font-medium text-red-600">
                            <AlertCircle className="w-3.5 h-3.5" />High Priority
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* NOTIFICATIONS */}
          {view === 'notifications' && (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <Bell className="w-10 h-10 mb-3 text-gray-300" />
              <p className="font-medium text-gray-500">No notifications yet</p>
              <p className="text-sm mt-1">You're all caught up!</p>
            </div>
          )}

        </main>
      </div>
    </div>
    </ErrorBoundary>
  );
}
