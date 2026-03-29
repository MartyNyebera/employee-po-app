import { useState, useEffect } from 'react';
import { Package, ClipboardList, Bell, LogOut, Plus, Menu, X, User, Wifi, WifiOff, AlertCircle } from 'lucide-react';

export type EmployeeView = 'inventory' | 'requests' | 'history' | 'notifications';

interface InventoryItem {
  id: number;
  itemName: string;
  itemCode: string;
  quantity: number;
  unit: string;
  status: 'in-stock' | 'low-stock' | 'out-of-stock';
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

  // Request management state
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [employee, setEmployee] = useState<any>(null);

  const [requestForm, setRequestForm] = useState<RequestForm>({
    item_name: '',
    item_code: '',
    quantity_requested: '',
    unit: '',
    purpose: '',
    urgency: 'normal',
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

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
      // Debug: Log employee data
      console.log('Employee data:', employee);
      console.log('Employee name:', employee?.full_name);
      
      const requestData = {
        ...requestForm,
        employee_id: employee?.id || 1,
        employee_name: employee?.full_name || employee?.email || 'Unknown Employee'
      };
      
      // Debug: Log request data
      console.log('Request data:', requestData);
      
      const result = await fetchEmployeeApi('/material-requests', {
        method: 'POST',
        body: JSON.stringify(requestData)
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
      setView('history');
      
      // Show success message
      alert('Material request submitted successfully!');
    } catch (error) {
      console.error('Failed to submit request:', error);
      alert('Failed to submit request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('employee_token');
    window.location.href = '/employee/login';
  };

  // Data fetching
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [inventoryData, requestsData] = await Promise.all([
          fetchEmployeeApi('/inventory'),
          fetchEmployeeApi(`/material-requests/employee/${employee?.id || 1}`)
        ]);
        
        setInventory(inventoryData || []);
        setRequests(requestsData || []);
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

  // Filter inventory
  const filteredInventory = inventory.filter(item =>
    item.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.itemCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
                {/* Search and Filter Bar */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <div className="flex flex-col sm:flex-row gap-4">
                    {/* Search */}
                    <div className="flex-1 relative">
                      <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400">
                        <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
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
                      <div key={item.id} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <h3 className="font-semibold text-slate-900 text-base mb-1">{item.itemName}</h3>
                              <p className="text-sm text-slate-500">Code: {item.itemCode}</p>
                            </div>
                            <span className={`px-2 py-1 text-xs font-medium rounded-full border ${
                              item.status === 'in-stock' ? 'bg-green-50 text-green-600 border-green-200' :
                              item.status === 'low-stock' ? 'bg-yellow-50 text-yellow-600 border-yellow-200' :
                              item.status === 'out-of-stock' ? 'bg-red-50 text-red-600 border-red-200' :
                              'bg-gray-50 text-gray-600 border-gray-200'
                            }`}>
                              {item.status ? item.status.replace('-', ' ') : 'Unknown'}
                            </span>
                          </div>
                          
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-2xl font-bold text-slate-900">{item.quantity}</span>
                            <span className="text-sm text-slate-500">{item.unit}</span>
                          </div>
                          
                          <button
                            onClick={() => {
                              setSelectedItem(item);
                              setRequestForm({
                                item_name: item.itemName,
                                item_code: item.itemCode,
                                quantity_requested: '',
                                unit: item.unit,
                                purpose: '',
                                urgency: 'normal',
                              });
                              setShowRequestModal(true);
                            }}
                            className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                          >
                            Request Item
                          </button>
                        </div>
                      </div>
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
                        <input
                          type="text"
                          placeholder="Enter item name"
                          value={requestForm.item_name}
                          onChange={(e) => setRequestForm({...requestForm, item_name: e.target.value})}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {formErrors.item_name && (
                          <p className="text-red-500 text-xs mt-1">{formErrors.item_name}</p>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">Item Code</label>
                          <input
                            type="text"
                            placeholder="Item code (optional)"
                            value={requestForm.item_code}
                            onChange={(e) => setRequestForm({...requestForm, item_code: e.target.value})}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">Quantity</label>
                          <input
                            type="text"
                            placeholder="Quantity"
                            value={requestForm.quantity_requested}
                            onChange={(e) => setRequestForm({...requestForm, quantity_requested: e.target.value})}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          {formErrors.quantity_requested && (
                            <p className="text-red-500 text-xs mt-1">{formErrors.quantity_requested}</p>
                          )}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">Unit</label>
                          <select
                            value={requestForm.unit}
                            onChange={(e) => setRequestForm({...requestForm, unit: e.target.value})}
                            className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Select unit</option>
                            <option value="pcs">Pieces</option>
                            <option value="kg">Kilograms</option>
                            <option value="liters">Liters</option>
                            <option value="meters">Meters</option>
                            <option value="boxes">Boxes</option>
                            <option value="sets">Sets</option>
                          </select>
                          {formErrors.unit && (
                            <p className="text-red-500 text-xs mt-1">{formErrors.unit}</p>
                          )}
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">Urgency</label>
                          <select
                            value={requestForm.urgency}
                            onChange={(e) => setRequestForm({...requestForm, urgency: e.target.value as 'low' | 'normal' | 'high'})}
                            className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="low">Low</option>
                            <option value="normal">Normal</option>
                            <option value="high">High</option>
                          </select>
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Purpose</label>
                        <textarea
                          placeholder="Describe the purpose of this request..."
                          value={requestForm.purpose}
                          onChange={(e) => setRequestForm({...requestForm, purpose: e.target.value})}
                          rows={3}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {formErrors.purpose && (
                          <p className="text-red-500 text-xs mt-1">{formErrors.purpose}</p>
                        )}
                      </div>
                      
                      <div className="flex gap-3">
                        <button
                          onClick={() => setView('inventory')}
                          className="flex-1 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSubmitRequest}
                          disabled={isSubmitting}
                          className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                          {isSubmitting ? 'Submitting...' : 'Submit Request'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* MY REQUESTS */}
            {view === 'history' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-slate-900">My Material Requests</h2>
                    <span className="text-sm text-slate-500">{requests.length} requests</span>
                  </div>
                </div>

                {requests.length === 0 ? (
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
                    {requests.map(request => (
                      <div key={request.id} className="bg-white rounded-xl border border-slate-200 shadow-sm">
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
                                <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
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
                      </div>
                    ))}
                  </div>
                )}
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
