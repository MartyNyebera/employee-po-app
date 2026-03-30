import { useState, useEffect } from 'react';
import { fetchApi } from '../api/client';
import {
  Truck, Package, User, RefreshCw, CheckCircle, Clock,
  Navigation, AlertCircle, ChevronDown, ChevronUp, X, Send
} from 'lucide-react';

interface SalesOrder {
  id: string;
  soNumber: string;
  client: string;
  description: string;
  amount: number;
  status: string;
  deliveryDate: string;
  createdDate: string;
  delivery_id: string | null;
  delivery_status: string | null;
}

interface DriverAccount {
  id: number;
  full_name: string;
  email: string;
  vehicle_id: string | null;
  vehicle_name: string | null;
  plate_number: string | null;
}

interface Vehicle {
  id: string;
  unit_name: string;
  plate_number: string;
  vehicle_type: string;
}

interface Delivery {
  id: string;
  so_number: string;
  customer_name: string;
  customer_address: string;
  delivery_date: string;
  status: string;
  driver_name: string | null;
  vehicle_name: string | null;
  plate_number: string | null;
  assigned_time: string | null;
  picked_up_time: string | null;
  in_transit_time: string | null;
  arrived_time: string | null;
  completed_time: string | null;
  notes: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  Pending:      'bg-slate-100 text-slate-600 border-slate-200',
  Assigned:     'bg-blue-100 text-blue-700 border-blue-200',
  'Picked Up':  'bg-indigo-100 text-indigo-700 border-indigo-200',
  'In Transit': 'bg-amber-100 text-amber-700 border-amber-200',
  Arrived:      'bg-cyan-100 text-cyan-700 border-cyan-200',
  Completed:    'bg-green-100 text-green-700 border-green-200',
  Cancelled:    'bg-red-100 text-red-600 border-red-200',
};

const SO_STATUS_COLOR: Record<string, string> = {
  pending:    'bg-slate-100 text-slate-600',
  approved:   'bg-green-100 text-green-700',
  Assigned:   'bg-blue-100 text-blue-700',
  completed:  'bg-emerald-100 text-emerald-700',
  cancelled:  'bg-red-100 text-red-600',
};

type Tab = 'unassigned' | 'active' | 'completed';

export function DeliveryManagement() {
  const [tab, setTab] = useState<Tab>('unassigned');
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [drivers, setDrivers] = useState<DriverAccount[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSO, setExpandedSO] = useState<string | null>(null);
  const [dispatchForm, setDispatchForm] = useState<Record<string, {
    driver_account_id: string;
    vehicle_id: string;
    delivery_date: string;
    notes: string;
  }>>({});
  const [dispatching, setDispatching] = useState<string | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [soData, delData, driverData, vehicleData] = await Promise.all([
        fetchApi('/sales-orders'),
        fetchApi('/deliveries'),
        fetchApi('/admin/drivers/accounts'),
        fetchApi('/fleet/vehicles'),
      ]);
      setSalesOrders(Array.isArray(soData) ? soData : []);
      setDeliveries(Array.isArray(delData) ? delData : []);
      setDrivers(Array.isArray(driverData) ? driverData : []);
      setVehicles(Array.isArray(vehicleData) ? vehicleData : []);
    } catch (err) {
      console.error('Failed to load delivery management data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  // SOs that are approved/pending but not yet dispatched to a delivery
  const unassignedSOs = salesOrders.filter(so =>
    !so.delivery_id &&
    (so.status === 'approved' || so.status === 'pending' || so.status === 'Pending')
  );

  const activeDeliveries = deliveries.filter(d =>
    !['Completed', 'Cancelled'].includes(d.status)
  );

  const completedDeliveries = deliveries.filter(d =>
    ['Completed', 'Cancelled'].includes(d.status)
  );

  const getFormFor = (soId: string, so: SalesOrder) => {
    if (!dispatchForm[soId]) {
      return {
        driver_account_id: '',
        vehicle_id: '',
        delivery_date: so.deliveryDate
          ? so.deliveryDate.split('T')[0]
          : new Date().toISOString().split('T')[0],
        notes: '',
      };
    }
    return dispatchForm[soId];
  };

  const setForm = (soId: string, patch: Partial<typeof dispatchForm[string]>) => {
    setDispatchForm(prev => ({
      ...prev,
      [soId]: { ...getFormFor(soId, salesOrders.find(s => s.id === soId)!), ...patch },
    }));
  };

  const handleDispatch = async (so: SalesOrder) => {
    const form = getFormFor(so.id, so);
    if (!form.driver_account_id && !form.vehicle_id) {
      alert('Please assign at least a driver or vehicle before dispatching.');
      return;
    }
    if (!form.delivery_date) {
      alert('Please set a delivery date.');
      return;
    }
    setDispatching(so.id);
    try {
      // Get driver account info to populate customer/address fields
      const driver = drivers.find(d => String(d.id) === form.driver_account_id);
      const vehicle = vehicles.find(v => v.id === form.vehicle_id);

      await fetchApi('/deliveries', {
        method: 'POST',
        body: JSON.stringify({
          so_number: so.soNumber,
          vehicle_id: form.vehicle_id || null,
          driver_id: null,
          driver_account_id: form.driver_account_id || null,
          customer_name: so.client,
          customer_address: so.description || so.client,
          delivery_date: form.delivery_date,
          notes: form.notes || null,
        }),
      });

      // Also assign vehicle to driver account for GPS ODO tracking
      if (form.driver_account_id && form.vehicle_id) {
        await fetchApi(`/admin/drivers/${form.driver_account_id}/assign-vehicle`, {
          method: 'PUT',
          body: JSON.stringify({ vehicle_id: form.vehicle_id }),
        });
      }

      await loadAll();
      setExpandedSO(null);
    } catch (err: any) {
      alert(err?.message || 'Failed to dispatch delivery.');
    } finally {
      setDispatching(null);
    }
  };

  const handleUpdateStatus = async (deliveryId: string, status: string) => {
    try {
      await fetchApi(`/deliveries/${deliveryId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      await loadAll();
    } catch (err) {
      alert('Failed to update status.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Loading delivery management...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Delivery Management</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Dispatch approved sales orders to drivers and vehicles
          </p>
        </div>
        <button onClick={loadAll} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {([
          { key: 'unassigned', label: 'Needs Dispatch', count: unassignedSOs.length, color: 'text-amber-600' },
          { key: 'active', label: 'Active', count: activeDeliveries.length, color: 'text-blue-600' },
          { key: 'completed', label: 'Completed', count: completedDeliveries.length, color: 'text-green-600' },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
              tab === t.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* UNASSIGNED SALES ORDERS TAB */}
      {tab === 'unassigned' && (
        <div className="space-y-3">
          {unassignedSOs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <CheckCircle className="w-10 h-10 mb-3 text-green-300" />
              <p className="font-medium text-gray-500">All sales orders are dispatched!</p>
            </div>
          ) : unassignedSOs.map(so => {
            const isExpanded = expandedSO === so.id;
            const form = getFormFor(so.id, so);
            const selectedDriver = drivers.find(d => String(d.id) === form.driver_account_id);
            return (
              <div key={so.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* SO Header Row */}
                <button
                  onClick={() => setExpandedSO(isExpanded ? null : so.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start gap-3 text-left">
                    <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                      <Package className="w-4 h-4 text-amber-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 text-sm">{so.soNumber}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SO_STATUS_COLOR[so.status] || 'bg-gray-100 text-gray-600'}`}>
                          {so.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-0.5">{so.client}</p>
                      {so.description && (
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{so.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-gray-400">Amount</p>
                      <p className="text-sm font-semibold text-gray-900">
                        ₱{Number(so.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4 text-gray-400" />
                      : <ChevronDown className="w-4 h-4 text-gray-400" />
                    }
                  </div>
                </button>

                {/* Dispatch Form */}
                {isExpanded && (
                  <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-4">
                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Dispatch Details</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Driver Selector */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Driver <span className="text-gray-400">(PWA Driver Account)</span>
                        </label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                          <select
                            value={form.driver_account_id}
                            onChange={e => {
                              const d = drivers.find(dr => String(dr.id) === e.target.value);
                              setForm(so.id, {
                                driver_account_id: e.target.value,
                                vehicle_id: d?.vehicle_id || form.vehicle_id,
                              });
                            }}
                            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">— Select Driver —</option>
                            {drivers.map(d => (
                              <option key={d.id} value={d.id}>
                                {d.full_name}{d.vehicle_name ? ` · ${d.vehicle_name}` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                        {selectedDriver?.vehicle_name && (
                          <p className="text-xs text-blue-600 mt-1">
                            Default vehicle: {selectedDriver.vehicle_name} ({selectedDriver.plate_number})
                          </p>
                        )}
                      </div>

                      {/* Vehicle Selector */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Vehicle</label>
                        <div className="relative">
                          <Truck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                          <select
                            value={form.vehicle_id}
                            onChange={e => setForm(so.id, { vehicle_id: e.target.value })}
                            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">— Select Vehicle —</option>
                            {vehicles.map(v => (
                              <option key={v.id} value={v.id}>
                                {v.unit_name} ({v.plate_number})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Delivery Date */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Delivery Date</label>
                        <input
                          type="date"
                          value={form.delivery_date}
                          onChange={e => setForm(so.id, { delivery_date: e.target.value })}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      {/* Notes */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
                        <input
                          type="text"
                          value={form.notes}
                          onChange={e => setForm(so.id, { notes: e.target.value })}
                          placeholder="Delivery instructions..."
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => setExpandedSO(null)}
                        className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleDispatch(so)}
                        disabled={dispatching === so.id}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        <Send className="w-4 h-4" />
                        {dispatching === so.id ? 'Dispatching...' : 'Dispatch Delivery'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ACTIVE DELIVERIES TAB */}
      {tab === 'active' && (
        <div className="space-y-3">
          {activeDeliveries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <Truck className="w-10 h-10 mb-3 text-gray-300" />
              <p className="font-medium text-gray-500">No active deliveries</p>
            </div>
          ) : activeDeliveries.map(d => (
            <div key={d.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 text-sm">{d.so_number}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLOR[d.status] || 'bg-gray-100 text-gray-600'}`}>
                      {d.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5">{d.customer_name}</p>
                  <div className="flex flex-wrap gap-3 mt-2">
                    {d.driver_name && (
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <User className="w-3 h-3" />{d.driver_name}
                      </span>
                    )}
                    {d.vehicle_name && (
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <Truck className="w-3 h-3" />{d.vehicle_name} · {d.plate_number}
                      </span>
                    )}
                    {d.delivery_date && (
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <Clock className="w-3 h-3" />{new Date(d.delivery_date).toLocaleDateString('en-PH')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Status Update Buttons */}
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
                {['Assigned', 'Picked Up', 'In Transit', 'Arrived', 'Completed', 'Cancelled'].map(s => (
                  <button
                    key={s}
                    onClick={() => handleUpdateStatus(d.id, s)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                      d.status === s
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {d.status === s && <CheckCircle className="w-3 h-3 inline mr-1" />}
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* COMPLETED DELIVERIES TAB */}
      {tab === 'completed' && (
        <div className="space-y-3">
          {completedDeliveries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <CheckCircle className="w-10 h-10 mb-3 text-gray-300" />
              <p className="font-medium text-gray-500">No completed deliveries yet</p>
            </div>
          ) : completedDeliveries.map(d => (
            <div key={d.id} className="bg-white rounded-xl border border-gray-200 p-4 opacity-80">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 text-sm">{d.so_number}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLOR[d.status] || 'bg-gray-100 text-gray-600'}`}>
                      {d.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5">{d.customer_name}</p>
                  <div className="flex flex-wrap gap-3 mt-1.5">
                    {d.driver_name && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <User className="w-3 h-3" />{d.driver_name}
                      </span>
                    )}
                    {d.vehicle_name && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Truck className="w-3 h-3" />{d.vehicle_name}
                      </span>
                    )}
                    {d.completed_time && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <CheckCircle className="w-3 h-3 text-green-500" />
                        {new Date(d.completed_time).toLocaleDateString('en-PH')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
