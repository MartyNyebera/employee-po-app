import { useEffect, useState } from 'react';
import { fetchApi } from '../api/client';
import { Truck, Plus, X, ChevronDown, Clock, CheckCircle2, AlertCircle, Navigation } from 'lucide-react';
import { Button } from './ui/button';

interface Delivery {
  id: string;
  so_number: string;
  vehicle_id: string | null;
  driver_id: string | null;
  driver_name: string | null;
  vehicle_name: string | null;
  plate_number: string | null;
  customer_name: string;
  customer_address: string;
  delivery_date: string;
  status: string;
  assigned_time: string | null;
  picked_up_time: string | null;
  in_transit_time: string | null;
  arrived_time: string | null;
  completed_time: string | null;
  proof_of_delivery_url: string | null;
  notes: string | null;
  created_at: string;
}

interface Driver { id: string; driver_name: string; contact: string; }
interface Vehicle { id: string; unit_name: string; plate_number: string; }
interface SalesOrder { id: string; so_number: string; client: string; description: string; }

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
  Pending:     { color: 'bg-slate-100 text-slate-600 border-slate-200', icon: <Clock className="size-3" /> },
  Assigned:    { color: 'bg-blue-100 text-blue-700 border-blue-200', icon: <Truck className="size-3" /> },
  'Picked Up': { color: 'bg-indigo-100 text-indigo-700 border-indigo-200', icon: <Truck className="size-3" /> },
  'In Transit':{ color: 'bg-amber-100 text-amber-700 border-amber-200', icon: <Navigation className="size-3" /> },
  Arrived:     { color: 'bg-cyan-100 text-cyan-700 border-cyan-200', icon: <CheckCircle2 className="size-3" /> },
  Completed:   { color: 'bg-green-100 text-green-700 border-green-200', icon: <CheckCircle2 className="size-3" /> },
  Cancelled:   { color: 'bg-red-100 text-red-600 border-red-200', icon: <AlertCircle className="size-3" /> },
};

const STATUS_FLOW = ['Pending', 'Assigned', 'Picked Up', 'In Transit', 'Arrived', 'Completed'];

const emptyForm = {
  so_number: '', vehicle_id: '', driver_id: '',
  customer_name: '', customer_address: '', delivery_date: '', notes: '',
};

export function DeliveriesList({ isAdmin }: { isAdmin: boolean }) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [detailDelivery, setDetailDelivery] = useState<Delivery | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);

  const fetchAll = async () => {
    try {
      const [d, dr, v, so] = await Promise.all([
        fetchApi<Delivery[]>('/deliveries'),
        fetchApi<Driver[]>('/drivers'),
        fetchApi<Vehicle[]>('/fleet/vehicles'),
        fetchApi<any[]>('/sales-orders'),
      ]);
      setDeliveries(Array.isArray(d) ? d : []);
      setDrivers(Array.isArray(dr) ? dr : []);
      setVehicles(Array.isArray(v) ? v : []);
      setSalesOrders(Array.isArray(so) ? so : []);
    } catch { setDeliveries([]); }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const openCreate = () => {
    setForm(emptyForm);
    setFormError('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.so_number || !form.customer_name || !form.customer_address || !form.delivery_date) {
      setFormError('SO Number, Customer Name, Address, and Delivery Date are required.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await fetchApi('/deliveries', {
        method: 'POST',
        body: JSON.stringify({ ...form, vehicle_id: form.vehicle_id || null, driver_id: form.driver_id || null }),
      });
      setModalOpen(false);
      fetchAll();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to create delivery.');
    }
    setSaving(false);
  };

  const updateStatus = async (delivery: Delivery, newStatus: string) => {
    setStatusUpdating(delivery.id);
    try {
      await fetchApi(`/deliveries/${delivery.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      fetchAll();
      if (detailDelivery?.id === delivery.id) {
        const updated = await fetchApi<Delivery>(`/deliveries/${delivery.id}`);
        setDetailDelivery(updated);
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to update status.');
    }
    setStatusUpdating(null);
  };

  const getNextStatus = (current: string) => {
    const idx = STATUS_FLOW.indexOf(current);
    return idx >= 0 && idx < STATUS_FLOW.length - 1 ? STATUS_FLOW[idx + 1] : null;
  };

  const filtered = deliveries.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = !q || d.so_number.toLowerCase().includes(q) ||
      d.customer_name.toLowerCase().includes(q) ||
      (d.driver_name || '').toLowerCase().includes(q);
    const matchStatus = !filterStatus || d.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const StatusBadge = ({ status }: { status: string }) => {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.Pending;
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.color}`}>
        {cfg.icon}{status}
      </span>
    );
  };

  const Timeline = ({ delivery }: { delivery: Delivery }) => {
    const steps = [
      { label: 'Created', time: delivery.created_at },
      { label: 'Assigned', time: delivery.assigned_time },
      { label: 'Picked Up', time: delivery.picked_up_time },
      { label: 'In Transit', time: delivery.in_transit_time },
      { label: 'Arrived', time: delivery.arrived_time },
      { label: 'Completed', time: delivery.completed_time },
    ];
    return (
      <div className="space-y-2 mt-3">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-3 text-sm">
            <div className={`w-3 h-3 rounded-full flex-shrink-0 ${s.time ? 'bg-green-500' : 'bg-slate-200'}`} />
            <span className={`font-medium w-24 ${s.time ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'}`}>{s.label}</span>
            <span className="text-slate-500 text-xs">{s.time ? new Date(s.time).toLocaleString() : '—'}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shadow">
            <Truck className="size-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">Deliveries</h2>
            <p className="text-sm text-slate-500">{deliveries.length} total · {deliveries.filter(d => d.status === 'In Transit').length} in transit</p>
          </div>
        </div>
        {isAdmin && (
          <Button onClick={openCreate} className="bg-amber-500 hover:bg-amber-600 text-white gap-2">
            <Plus className="size-4" /> New Delivery
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input type="text" placeholder="Search SO, customer, driver…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-slate-800 dark:border-slate-600 dark:text-white" />
        <div className="relative">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 pr-8 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-slate-800 dark:border-slate-600 dark:text-white">
            <option value="">All Statuses</option>
            {Object.keys(STATUS_CONFIG).map(s => <option key={s}>{s}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-2.5 size-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-slate-400">Loading deliveries…</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-400">
          <Truck className="size-10 opacity-30" />
          <p>{search || filterStatus ? 'No deliveries match filters.' : 'No deliveries yet. Create one from a Sales Order.'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase text-xs tracking-wide">
              <tr>
                <th className="text-left px-4 py-3">SO / Customer</th>
                <th className="text-left px-4 py-3">Driver</th>
                <th className="text-left px-4 py-3">Vehicle</th>
                <th className="text-left px-4 py-3">Delivery Date</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {filtered.map(d => {
                const next = getNextStatus(d.status);
                const isUpdating = statusUpdating === d.id;
                return (
                  <tr key={d.id} className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-blue-600 dark:text-blue-400">{d.so_number}</div>
                      <div className="text-xs text-slate-600 dark:text-slate-300">{d.customer_name}</div>
                      <div className="text-xs text-slate-400 truncate max-w-[180px]">{d.customer_address}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {d.driver_name || <span className="text-slate-400 italic text-xs">Unassigned</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {d.vehicle_name ? <span>{d.vehicle_name}{d.plate_number ? ` (${d.plate_number})` : ''}</span>
                        : <span className="text-slate-400 italic text-xs">Unassigned</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 text-xs">
                      {new Date(d.delivery_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setDetailDelivery(d)}
                          className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors">
                          View
                        </button>
                        {isAdmin && next && d.status !== 'Cancelled' && (
                          <button
                            disabled={isUpdating}
                            onClick={() => updateStatus(d, next)}
                            className="px-2.5 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50">
                            {isUpdating ? '…' : `→ ${next}`}
                          </button>
                        )}
                        {isAdmin && d.status !== 'Completed' && d.status !== 'Cancelled' && (
                          <button
                            disabled={isUpdating}
                            onClick={() => updateStatus(d, 'Cancelled')}
                            className="px-2.5 py-1.5 text-xs rounded-lg border border-red-200 hover:bg-red-50 text-red-500 transition-colors disabled:opacity-50">
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">New Delivery</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                <X className="size-5 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {formError && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-3 py-2">{formError}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Sales Order Number <span className="text-red-500">*</span></label>
                  <input type="text" value={form.so_number} onChange={e => setForm(f => ({ ...f, so_number: e.target.value }))}
                    list="so-list"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                    placeholder="SO-001" />
                  <datalist id="so-list">
                    {salesOrders.map(so => <option key={so.id} value={so.so_number}>{so.so_number} — {so.client}</option>)}
                  </datalist>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Customer Name <span className="text-red-500">*</span></label>
                  <input type="text" value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                    placeholder="Customer name" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Delivery Address <span className="text-red-500">*</span></label>
                  <input type="text" value={form.customer_address} onChange={e => setForm(f => ({ ...f, customer_address: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                    placeholder="Full delivery address" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Delivery Date <span className="text-red-500">*</span></label>
                  <input type="datetime-local" value={form.delivery_date} onChange={e => setForm(f => ({ ...f, delivery_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-slate-800 dark:border-slate-600 dark:text-white" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Driver</label>
                  <select value={form.driver_id} onChange={e => setForm(f => ({ ...f, driver_id: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-slate-800 dark:border-slate-600 dark:text-white">
                    <option value="">None</option>
                    {drivers.filter(d => d).map(d => <option key={d.id} value={d.id}>{d.driver_name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Vehicle</label>
                  <select value={form.vehicle_id} onChange={e => setForm(f => ({ ...f, vehicle_id: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-slate-800 dark:border-slate-600 dark:text-white">
                    <option value="">None</option>
                    {vehicles.map(v => <option key={v.id} value={v.id}>{v.unit_name}{v.plate_number ? ` (${v.plate_number})` : ''}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Notes</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-slate-800 dark:border-slate-600 dark:text-white resize-none"
                    placeholder="Optional notes" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 pb-6">
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-white">
                {saving ? 'Creating…' : 'Create Delivery'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailDelivery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
              <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">{detailDelivery.so_number}</h3>
                <p className="text-xs text-slate-500">{detailDelivery.id}</p>
              </div>
              <button onClick={() => setDetailDelivery(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                <X className="size-5 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <StatusBadge status={detailDelivery.status} />
                {isAdmin && getNextStatus(detailDelivery.status) && detailDelivery.status !== 'Cancelled' && (
                  <button
                    disabled={statusUpdating === detailDelivery.id}
                    onClick={() => updateStatus(detailDelivery, getNextStatus(detailDelivery.status)!)}
                    className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50">
                    {statusUpdating === detailDelivery.id ? '…' : `Advance → ${getNextStatus(detailDelivery.status)}`}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-1">Customer</div>
                  <div className="font-semibold text-slate-700 dark:text-slate-200">{detailDelivery.customer_name}</div>
                  <div className="text-xs text-slate-500">{detailDelivery.customer_address}</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-1">Scheduled</div>
                  <div className="font-semibold text-slate-700 dark:text-slate-200">{new Date(detailDelivery.delivery_date).toLocaleDateString()}</div>
                  <div className="text-xs text-slate-500">{new Date(detailDelivery.delivery_date).toLocaleTimeString()}</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-1">Driver</div>
                  <div className="font-semibold text-slate-700 dark:text-slate-200">{detailDelivery.driver_name || '—'}</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-1">Vehicle</div>
                  <div className="font-semibold text-slate-700 dark:text-slate-200">{detailDelivery.vehicle_name || '—'}</div>
                  {detailDelivery.plate_number && <div className="text-xs text-slate-500">{detailDelivery.plate_number}</div>}
                </div>
              </div>
              {detailDelivery.notes && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-200">
                  <span className="font-semibold">Notes: </span>{detailDelivery.notes}
                </div>
              )}
              {detailDelivery.proof_of_delivery_url && (
                <div>
                  <div className="text-xs font-semibold text-slate-500 mb-1">Proof of Delivery</div>
                  <img src={detailDelivery.proof_of_delivery_url} alt="POD" className="rounded-lg max-h-40 object-cover" />
                </div>
              )}
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Timeline</div>
                <Timeline delivery={detailDelivery} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
