import { useState, useEffect } from 'react';
import { Package, ClipboardList, Bell, 
  LogOut, Plus, Clock, CheckCircle, 
  XCircle, Search } from 'lucide-react';

type EmployeeView = 'inventory' | 'requests' | 
  'history' | 'notifications';

export function EmployeePortal() {
  const [view, setView] = useState
    <EmployeeView>('inventory');
  const [employee, setEmployee] = useState
    <any>(null);
  const [inventory, setInventory] = useState
    <any[]>([]);
  const [requests, setRequests] = useState
    <any[]>([]);
  const [notifications, setNotifications] = useState
    <any[]>([]);
  const [showRequestModal, setShowRequestModal] = 
    useState(false);
  const [selectedItem, setSelectedItem] = 
    useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);

  const [requestForm, setRequestForm] = useState({
    item_name: '',
    item_code: '',
    quantity_requested: 1,
    unit: 'pcs',
    purpose: '',
    urgency: 'normal'
  });

  useEffect(() => {
    const stored = localStorage.getItem(
      'employee_session'
    );
    if (!stored) {
      window.location.href = '/employee/login';
      return;
    }
    const session = JSON.parse(stored);
    setEmployee(session);
    loadInventory();
    loadRequests(session.id);
    loadNotifications(session.id);
  }, []);

  const loadInventory = async () => {
    try {
      const res = await fetch('/api/inventory');
      const data = await res.json();
      setInventory(Array.isArray(data) ? data : []);
    } catch { setInventory([]); }
  };

  const loadRequests = async (id: number) => {
    try {
      const res = await fetch(
        `/api/material-requests/employee/${id}` 
      );
      const data = await res.json();
      setRequests(Array.isArray(data) ? data : []);
    } catch { setRequests([]); }
  };

  const loadNotifications = async (id: number) => {
    try {
      const res = await fetch(
        `/api/employee/${id}/notifications` 
      );
      const data = await res.json();
      setNotifications(
        Array.isArray(data) ? data : []
      );
      setUnreadCount(
        data.filter((n: any) => !n.is_read).length
      );
    } catch { setNotifications([]); }
  };

  const handleSubmitRequest = async () => {
    if (!employee) return;
    try {
      const res = await fetch('/api/material-requests', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          ...requestForm,
          employee_id: employee.id,
          employee_name: employee.full_name
        })
      });
      if (res.ok) {
        setShowRequestModal(false);
        setRequestForm({
          item_name: '', item_code: '',
          quantity_requested: 1, unit: 'pcs',
          purpose: '', urgency: 'normal'
        });
        loadRequests(employee.id);
        alert('Request submitted successfully!');
      }
    } catch {
      alert('Failed to submit request');
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
        return 'bg-green-100 text-green-700';
      case 'rejected': 
        return 'bg-red-100 text-red-700';
      default: 
        return 'bg-yellow-100 text-yellow-700';
    }
  };

  const filteredInventory = inventory.filter(item =>
    item.itemName?.toLowerCase().includes(
      searchTerm.toLowerCase()
    ) ||
    item.itemCode?.toLowerCase().includes(
      searchTerm.toLowerCase()
    )
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-slate-900 text-white 
        px-4 py-3 flex items-center 
        justify-between sticky top-0 z-40">
        <div>
          <p className="text-xs text-slate-400">
            KIMOEL EMPLOYEE PORTAL
          </p>
          <p className="font-semibold text-sm">
            {employee?.full_name}
          </p>
        </div>
        <button onClick={handleLogout}
          className="p-2 rounded-lg 
            hover:bg-slate-700">
          <LogOut className="size-5" />
        </button>
      </div>

      {/* Nav Tabs */}
      <div className="bg-white border-b 
        border-slate-200 px-4 flex gap-1 
        overflow-x-auto">
        {[
          { id: 'inventory', label: 'Inventory', 
            icon: Package },
          { id: 'requests', label: 'New Request', 
            icon: Plus },
          { id: 'history', label: 'My Requests', 
            icon: ClipboardList },
          { id: 'notifications', label: 'Notifications', 
            icon: Bell, badge: unreadCount },
        ].map(tab => (
          <button key={tab.id}
            onClick={() => setView(
              tab.id as EmployeeView
            )}
            className={`flex items-center gap-1.5 
              px-3 py-3 text-xs font-medium 
              whitespace-nowrap border-b-2 
              transition-colors relative
              ${view === tab.id 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-slate-500'
              }`}
          >
            <tab.icon className="size-4" />
            {tab.label}
            {tab.badge && tab.badge > 0 && (
              <span className="absolute -top-0.5 
                -right-0.5 bg-red-500 text-white 
                text-xs rounded-full w-4 h-4 
                flex items-center justify-center">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4 pb-8">

        {/* INVENTORY VIEW */}
        {view === 'inventory' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 
              bg-white rounded-xl border 
              border-slate-200 px-3 py-2">
              <Search className="size-4 
                text-slate-400" />
              <input
                type="text"
                placeholder="Search inventory..."
                className="flex-1 bg-transparent 
                  text-sm outline-none"
                value={searchTerm}
                onChange={e => 
                  setSearchTerm(e.target.value)
                }
              />
            </div>
            {filteredInventory.map(item => (
              <div key={item.id}
                className="bg-white rounded-xl 
                  border border-slate-200 p-4">
                <div className="flex justify-between 
                  items-start mb-2">
                  <div>
                    <p className="font-semibold 
                      text-slate-900">
                      {item.itemName}
                    </p>
                    <p className="text-xs 
                      text-slate-500">
                      {item.itemCode}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 
                    rounded-full font-medium
                    ${item.status === 'in-stock' 
                      ? 'bg-green-100 text-green-700'
                      : item.status === 'low-stock'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-red-100 text-red-700'
                    }`}>
                    {item.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 
                  mb-3">{item.description}</p>
                <div className="flex justify-between 
                  items-center">
                  <span className="text-sm font-bold 
                    text-slate-700">
                    Qty: {item.quantity} {item.unit}
                  </span>
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
                    className="bg-blue-600 text-white 
                      text-xs px-3 py-1.5 rounded-lg
                      flex items-center gap-1"
                  >
                    <Plus className="size-3" />
                    Request
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* NEW REQUEST VIEW */}
        {view === 'requests' && (
          <div className="bg-white rounded-xl 
            border border-slate-200 p-4 space-y-4">
            <h3 className="font-bold text-slate-900">
              Submit Material Request
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium 
                  text-slate-700 block mb-1">
                  Item Name *
                </label>
                <input
                  className="w-full border 
                    border-slate-200 rounded-lg 
                    px-3 py-2 text-sm"
                  value={requestForm.item_name}
                  onChange={e => setRequestForm(
                    f => ({...f, 
                      item_name: e.target.value})
                  )}
                  placeholder="Enter item name"
                />
              </div>
              <div>
                <label className="text-xs font-medium 
                  text-slate-700 block mb-1">
                  Item Code
                </label>
                <input
                  className="w-full border 
                    border-slate-200 rounded-lg 
                    px-3 py-2 text-sm"
                  value={requestForm.item_code}
                  onChange={e => setRequestForm(
                    f => ({...f, 
                      item_code: e.target.value})
                  )}
                  placeholder="Optional"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs 
                    font-medium text-slate-700 
                    block mb-1">Quantity *
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="w-full border 
                      border-slate-200 rounded-lg 
                      px-3 py-2 text-sm"
                    value={requestForm.quantity_requested}
                    onChange={e => setRequestForm(
                      f => ({...f, 
                        quantity_requested: 
                          parseInt(e.target.value)})
                    )}
                  />
                </div>
                <div>
                  <label className="text-xs 
                    font-medium text-slate-700 
                    block mb-1">Unit
                  </label>
                  <select
                    className="w-full border 
                      border-slate-200 rounded-lg 
                      px-3 py-2 text-sm bg-white"
                    value={requestForm.unit}
                    onChange={e => setRequestForm(
                      f => ({...f, unit: e.target.value})
                    )}
                  >
                    <option value="pcs">pcs</option>
                    <option value="box">box</option>
                    <option value="kg">kg</option>
                    <option value="liter">liter</option>
                    <option value="meter">meter</option>
                    <option value="set">set</option>
                    <option value="lot">lot</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium 
                  text-slate-700 block mb-1">
                  Urgency
                </label>
                <select
                  className="w-full border 
                    border-slate-200 rounded-lg 
                    px-3 py-2 text-sm bg-white"
                  value={requestForm.urgency}
                  onChange={e => setRequestForm(
                    f => ({...f, urgency: e.target.value})
                  )}
                >
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium 
                  text-slate-700 block mb-1">
                  Purpose *
                </label>
                <textarea
                  className="w-full border 
                    border-slate-200 rounded-lg 
                    px-3 py-2 text-sm resize-none"
                  rows={3}
                  value={requestForm.purpose}
                  onChange={e => setRequestForm(
                    f => ({...f, purpose: e.target.value})
                  )}
                  placeholder="Why do you need this?"
                />
              </div>
              <button
                onClick={handleSubmitRequest}
                className="w-full bg-blue-600 
                  text-white py-3 rounded-xl 
                  font-semibold text-sm"
              >
                Submit Request
              </button>
            </div>
          </div>
        )}

        {/* REQUEST HISTORY VIEW */}
        {view === 'history' && (
          <div className="space-y-3">
            {requests.length === 0 ? (
              <div className="text-center py-12">
                <ClipboardList className="size-12 
                  text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">
                  No requests yet
                </p>
              </div>
            ) : requests.map(req => (
              <div key={req.id}
                className="bg-white rounded-xl 
                  border border-slate-200 p-4">
                <div className="flex justify-between 
                  items-start mb-2">
                  <p className="font-semibold text-sm 
                    text-slate-900">
                    {req.request_number}
                  </p>
                  <span className={`text-xs px-2 
                    py-1 rounded-full font-medium
                    ${getStatusColor(req.status)}`}>
                    {req.status}
                  </span>
                </div>
                <p className="text-sm text-slate-700 
                  mb-1">
                  {req.item_name} — {req.quantity_requested} {req.unit}
                </p>
                <p className="text-xs text-slate-500 
                  mb-2">{req.purpose}</p>
                {req.admin_notes && (
                  <div className="bg-slate-50 
                    rounded-lg p-2 mt-2">
                    <p className="text-xs 
                      text-slate-600">
                      Admin note: {req.admin_notes}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* NOTIFICATIONS VIEW */}
        {view === 'notifications' && (
          <div className="space-y-3">
            {notifications.length === 0 ? (
              <div className="text-center py-12">
                <Bell className="size-12 
                  text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">
                  No notifications yet
                </p>
              </div>
            ) : notifications.map(notif => (
              <div key={notif.id}
                className={`rounded-xl border p-4
                  ${notif.is_read 
                    ? 'bg-white border-slate-200' 
                    : 'bg-blue-50 border-blue-200'
                  }`}>
                <div className="flex justify-between 
                  items-start mb-1">
                  <p className="font-semibold text-sm 
                    text-slate-900">{notif.title}</p>
                  {!notif.is_read && (
                    <span className="w-2 h-2 
                      bg-blue-500 rounded-full 
                      flex-shrink-0 mt-1" />
                  )}
                </div>
                <p className="text-xs text-slate-600">
                  {notif.message}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
