import { useEffect, useState } from 'react';
import { fetchVehicle, fetchMaintenance, fetchVehiclePOs, fetchOdometerLogs, createMaintenance, createVehiclePO, logOdometer, type Vehicle, type MaintenanceRecord, type FleetPO, type OdometerLog } from '../api/fleet';
import { Button } from './ui/button';
import { ArrowLeft, Wrench, FileText, Gauge, Info, Plus, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface VehicleDetailsProps {
  vehicleId: string;
  onBack: () => void;
}

type Tab = 'overview' | 'maintenance' | 'purchase-orders' | 'odometer';

function PmsBadge({ status }: { status?: string }) {
  if (status === 'OVERDUE') return (
    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
      <AlertTriangle className="size-4" /> Overdue
    </span>
  );
  if (status === 'DUE_SOON') return (
    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
      <Clock className="size-4" /> Due Soon
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
      <CheckCircle className="size-4" /> OK
    </span>
  );
}

const TYPE_ICONS: Record<string, string> = {
  'Dump Truck': '🚛', 'Mini Dump': '🚚', 'Backhoe': '🚜', 'Boom Truck': '🏗️', 'L3 Loader': '⚙️',
};

export function VehicleDetails({ vehicleId, onBack }: VehicleDetailsProps) {
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([]);
  const [pos, setPos] = useState<FleetPO[]>([]);
  const [odometerLogs, setOdometerLogs] = useState<OdometerLog[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false);
  const [showOdometerForm, setShowOdometerForm] = useState(false);
  const [showPOForm, setShowPOForm] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const [v, m, p, o] = await Promise.all([
        fetchVehicle(vehicleId),
        fetchMaintenance(vehicleId),
        fetchVehiclePOs(vehicleId),
        fetchOdometerLogs(vehicleId),
      ]);
      setVehicle(v);
      setMaintenance(m);
      setPos(p);
      setOdometerLogs(o);
    } catch (err: any) {
      toast.error('Failed to load vehicle: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [vehicleId]);

  if (loading) return <div className="p-6 text-center text-slate-500">Loading vehicle details...</div>;
  if (!vehicle) return <div className="p-6 text-center text-slate-500">Vehicle not found.</div>;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'maintenance', label: 'Maintenance', icon: Wrench },
    { id: 'purchase-orders', label: 'Purchase Orders', icon: FileText },
    { id: 'odometer', label: 'Odometer Logs', icon: Gauge },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Back + Header */}
      <div>
        <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 dark:hover:text-white text-sm mb-4">
          <ArrowLeft className="size-4" /> Back to Fleet
        </button>
        <div className="flex items-center gap-4">
          <div className="text-4xl">{TYPE_ICONS[vehicle.vehicle_type] || '🚗'}</div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{vehicle.unit_name}</h1>
            <p className="text-slate-500 dark:text-slate-400">{vehicle.vehicle_type}{vehicle.plate_number ? ` · ${vehicle.plate_number}` : ''}</p>
          </div>
          <div className="ml-auto">
            <PmsBadge status={vehicle.pms_status} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as Tab)}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <tab.icon className="size-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab vehicle={vehicle} maintenance={maintenance} onUpdateOdometer={() => setShowOdometerForm(true)} />
      )}
      {activeTab === 'maintenance' && (
        <MaintenanceTab
          records={maintenance}
          onAdd={() => setShowMaintenanceForm(true)}
          showForm={showMaintenanceForm}
          onCloseForm={() => setShowMaintenanceForm(false)}
          vehicleId={vehicleId}
          onCreated={load}
        />
      )}
      {activeTab === 'purchase-orders' && (
        <POTab
          pos={pos}
          onAdd={() => setShowPOForm(true)}
          showForm={showPOForm}
          onCloseForm={() => setShowPOForm(false)}
          vehicleId={vehicleId}
          onCreated={load}
        />
      )}
      {activeTab === 'odometer' && (
        <OdometerTab
          logs={odometerLogs}
          vehicle={vehicle}
          showForm={showOdometerForm}
          onAdd={() => setShowOdometerForm(true)}
          onCloseForm={() => setShowOdometerForm(false)}
          onCreated={load}
        />
      )}
    </div>
  );
}

// ---- Overview Tab ----
function OverviewTab({ vehicle, maintenance, onUpdateOdometer }: { vehicle: Vehicle; maintenance: MaintenanceRecord[]; onUpdateOdometer: () => void }) {
  const latest = maintenance[0];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-3">
        <h3 className="font-semibold text-slate-900 dark:text-white">Vehicle Info</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Type</span><span className="font-medium text-slate-900 dark:text-white">{vehicle.vehicle_type}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Plate</span><span className="font-medium text-slate-900 dark:text-white">{vehicle.plate_number || '—'}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Tracker ID</span><span className="font-medium text-slate-900 dark:text-white">{vehicle.tracker_id || '—'}</span></div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-3">
        <h3 className="font-semibold text-slate-900 dark:text-white">Odometer</h3>
        <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{Number(vehicle.current_odometer).toLocaleString()} km</div>
        <Button size="sm" variant="outline" onClick={onUpdateOdometer}>Update Odometer</Button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-3 md:col-span-2">
        <h3 className="font-semibold text-slate-900 dark:text-white">Last Maintenance</h3>
        {latest ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Date</span><span className="font-medium text-slate-900 dark:text-white">{latest.service_date}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Description</span><span className="font-medium text-slate-900 dark:text-white">{latest.description}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Cost</span><span className="font-medium text-slate-900 dark:text-white">₱{Number(latest.total_cost).toLocaleString()}</span></div>
            {latest.next_due_date && <div className="flex justify-between"><span className="text-slate-500">Next Due Date</span><span className="font-medium text-slate-900 dark:text-white">{latest.next_due_date}</span></div>}
            {latest.next_due_odometer && <div className="flex justify-between"><span className="text-slate-500">Next Due Odometer</span><span className="font-medium text-slate-900 dark:text-white">{Number(latest.next_due_odometer).toLocaleString()} km</span></div>}
          </div>
        ) : (
          <p className="text-slate-500 text-sm">No maintenance records yet.</p>
        )}
      </div>
    </div>
  );
}

// ---- Maintenance Tab ----
function MaintenanceTab({ records, onAdd, showForm, onCloseForm, vehicleId, onCreated }: any) {
  const [form, setForm] = useState({ service_date: '', odometer_at_service: '', description: '', total_cost: '', next_due_date: '', next_due_odometer: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await createMaintenance(vehicleId, {
        service_date: form.service_date,
        odometer_at_service: parseFloat(form.odometer_at_service) || undefined,
        description: form.description,
        total_cost: parseFloat(form.total_cost) || 0,
        next_due_date: form.next_due_date || undefined,
        next_due_odometer: parseFloat(form.next_due_odometer) || undefined,
      });
      toast.success('Maintenance record added!');
      onCloseForm();
      onCreated();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-slate-900 dark:text-white">Maintenance History</h3>
        <Button size="sm" onClick={onAdd} className="bg-blue-600 hover:bg-blue-700 text-white"><Plus className="size-4 mr-1" />Add Record</Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-3">
          <h4 className="font-semibold text-slate-900 dark:text-white">New Maintenance Record</h4>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-slate-500 mb-1 block">Service Date *</label><input type="date" required value={form.service_date} onChange={e => setForm(f => ({ ...f, service_date: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="text-xs text-slate-500 mb-1 block">Odometer at Service</label><input type="number" value={form.odometer_at_service} onChange={e => setForm(f => ({ ...f, odometer_at_service: e.target.value }))} placeholder="km" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div className="col-span-2"><label className="text-xs text-slate-500 mb-1 block">Description *</label><input type="text" required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Oil change + filter" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="text-xs text-slate-500 mb-1 block">Total Cost (₱)</label><input type="number" value={form.total_cost} onChange={e => setForm(f => ({ ...f, total_cost: e.target.value }))} placeholder="0" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="text-xs text-slate-500 mb-1 block">Next Due Date <span className="text-slate-400">(default: +6 months)</span></label><input type="date" value={form.next_due_date} onChange={e => setForm(f => ({ ...f, next_due_date: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="text-xs text-slate-500 mb-1 block">Next Due Odometer <span className="text-slate-400">(default: +5,000 km)</span></label><input type="number" value={form.next_due_odometer} onChange={e => setForm(f => ({ ...f, next_due_odometer: e.target.value }))} placeholder="auto: odometer + 5000" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={onCloseForm}>Cancel</Button>
            <Button type="submit" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={saving}>{saving ? 'Saving...' : 'Save Record'}</Button>
          </div>
        </form>
      )}

      {records.length === 0 ? (
        <div className="text-center py-10 text-slate-500">No maintenance records yet.</div>
      ) : (
        <div className="space-y-3">
          {records.map((r: MaintenanceRecord) => (
            <div key={r.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">{r.description}</div>
                  <div className="text-sm text-slate-500 mt-1">{r.service_date} {r.odometer_at_service ? `· ${Number(r.odometer_at_service).toLocaleString()} km` : ''}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-slate-900 dark:text-white">₱{Number(r.total_cost).toLocaleString()}</div>
                  {r.next_due_date && <div className="text-xs text-slate-500">Next: {r.next_due_date}</div>}
                  {r.next_due_odometer && <div className="text-xs text-slate-500">Next: {Number(r.next_due_odometer).toLocaleString()} km</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- PO Tab ----
function POTab({ pos, onAdd, showForm, onCloseForm, vehicleId, onCreated }: any) {
  const [form, setForm] = useState({ po_number: '', supplier: '', date: '', total_cost: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await createVehiclePO(vehicleId, {
        po_number: form.po_number,
        supplier: form.supplier,
        date: form.date,
        total_cost: parseFloat(form.total_cost) || 0,
        notes: form.notes,
      });
      toast.success('Purchase order created!');
      onCloseForm();
      onCreated();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-slate-900 dark:text-white">Purchase Orders</h3>
        <Button size="sm" onClick={onAdd} className="bg-blue-600 hover:bg-blue-700 text-white"><Plus className="size-4 mr-1" />New PO</Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-3">
          <h4 className="font-semibold text-slate-900 dark:text-white">New Purchase Order</h4>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-slate-500 mb-1 block">PO Number *</label><input type="text" required value={form.po_number} onChange={e => setForm(f => ({ ...f, po_number: e.target.value }))} placeholder="PO-2026-001" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="text-xs text-slate-500 mb-1 block">Supplier</label><input type="text" value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} placeholder="Supplier name" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="text-xs text-slate-500 mb-1 block">Date *</label><input type="date" required value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="text-xs text-slate-500 mb-1 block">Total Cost (₱)</label><input type="number" value={form.total_cost} onChange={e => setForm(f => ({ ...f, total_cost: e.target.value }))} placeholder="0" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div className="col-span-2"><label className="text-xs text-slate-500 mb-1 block">Notes</label><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Optional notes" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={onCloseForm}>Cancel</Button>
            <Button type="submit" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={saving}>{saving ? 'Saving...' : 'Create PO'}</Button>
          </div>
        </form>
      )}

      {pos.length === 0 ? (
        <div className="text-center py-10 text-slate-500">No purchase orders yet.</div>
      ) : (
        <div className="space-y-3">
          {pos.map((po: FleetPO) => (
            <div key={po.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">{po.po_number}</div>
                  <div className="text-sm text-slate-500">{po.date} {po.supplier ? `· ${po.supplier}` : ''}</div>
                  {po.notes && <div className="text-sm text-slate-500 mt-1">{po.notes}</div>}
                </div>
                <div className="font-semibold text-slate-900 dark:text-white">₱{Number(po.total_cost).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Odometer Tab ----
function OdometerTab({ logs, vehicle, showForm, onAdd, onCloseForm, onCreated }: any) {
  const [newOdo, setNewOdo] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(newOdo);
    if (!val || val < vehicle.current_odometer) {
      toast.error('New odometer must be greater than current value');
      return;
    }
    try {
      setSaving(true);
      await logOdometer(vehicle.id, val, 'manual');
      toast.success('Odometer updated!');
      setNewOdo('');
      onCloseForm();
      onCreated();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-slate-900 dark:text-white">Odometer Logs</h3>
        <Button size="sm" onClick={onAdd} className="bg-blue-600 hover:bg-blue-700 text-white"><Plus className="size-4 mr-1" />Update Odometer</Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-3">
          <h4 className="font-semibold text-slate-900 dark:text-white">Update Odometer</h4>
          <p className="text-sm text-slate-500">Current: <span className="font-semibold text-slate-900 dark:text-white">{Number(vehicle.current_odometer).toLocaleString()} km</span></p>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">New Odometer Reading (km) *</label>
            <input type="number" required value={newOdo} onChange={e => setNewOdo(e.target.value)} min={vehicle.current_odometer} placeholder={String(vehicle.current_odometer)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onCloseForm}>Cancel</Button>
            <Button type="submit" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={saving}>{saving ? 'Saving...' : 'Update'}</Button>
          </div>
        </form>
      )}

      {logs.length === 0 ? (
        <div className="text-center py-10 text-slate-500">No odometer logs yet.</div>
      ) : (
        <div className="space-y-2">
          {logs.map((log: OdometerLog) => (
            <div key={log.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex justify-between items-center">
              <div>
                <div className="font-semibold text-slate-900 dark:text-white">{Number(log.odometer).toLocaleString()} km</div>
                <div className="text-xs text-slate-500">{new Date(log.recorded_at).toLocaleString()}</div>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 capitalize">{log.source}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
