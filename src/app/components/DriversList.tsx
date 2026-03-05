import { useEffect, useState } from 'react';
import { fetchApi } from '../api/client';
import { UserCheck, Plus, Pencil, Trash2, Car, AlertCircle, X, ChevronDown } from 'lucide-react';
import { Button } from './ui/button';

interface Driver {
  id: string;
  driver_name: string;
  contact: string;
  email: string | null;
  license_number: string;
  license_expiry: string;
  assigned_vehicle_id: string | null;
  vehicle_name: string | null;
  plate_number: string | null;
  status: 'Active' | 'Inactive' | 'On Leave';
  join_date: string;
  created_at: string;
}

interface Vehicle {
  id: string;
  unit_name: string;
  plate_number: string;
  vehicle_type: string;
}

const STATUS_COLORS: Record<string, string> = {
  Active: 'bg-green-100 text-green-700 border-green-200',
  Inactive: 'bg-slate-100 text-slate-600 border-slate-200',
  'On Leave': 'bg-amber-100 text-amber-700 border-amber-200',
};

const emptyForm = {
  driver_name: '', contact: '', email: '', license_number: '',
  license_expiry: '', assigned_vehicle_id: '', status: 'Active', join_date: '',
};

export function DriversList({ isAdmin }: { isAdmin: boolean }) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editDriver, setEditDriver] = useState<Driver | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchDrivers = async () => {
    try {
      const data = await fetchApi<Driver[]>('/drivers');
      setDrivers(Array.isArray(data) ? data : []);
    } catch { setDrivers([]); }
    setLoading(false);
  };

  const fetchVehicles = async () => {
    try {
      const data = await fetchApi<Vehicle[]>('/fleet/vehicles');
      setVehicles(Array.isArray(data) ? data : []);
    } catch { setVehicles([]); }
  };

  useEffect(() => { fetchDrivers(); fetchVehicles(); }, []);

  const openCreate = () => {
    setEditDriver(null);
    setForm(emptyForm);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (d: Driver) => {
    setEditDriver(d);
    setForm({
      driver_name: d.driver_name, contact: d.contact, email: d.email || '',
      license_number: d.license_number,
      license_expiry: d.license_expiry ? d.license_expiry.split('T')[0] : '',
      assigned_vehicle_id: d.assigned_vehicle_id || '',
      status: d.status,
      join_date: d.join_date ? d.join_date.split('T')[0] : '',
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.driver_name || !form.contact || !form.license_number || !form.license_expiry || !form.join_date) {
      setFormError('Please fill in all required fields.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload = { ...form, assigned_vehicle_id: form.assigned_vehicle_id || null, email: form.email || null };
      if (editDriver) {
        await fetchApi(`/drivers/${editDriver.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await fetchApi('/drivers', { method: 'POST', body: JSON.stringify(payload) });
      }
      setModalOpen(false);
      fetchDrivers();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save driver.');
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await fetchApi(`/drivers/${id}`, { method: 'DELETE' });
      setDeleteConfirm(null);
      fetchDrivers();
    } catch (err: any) {
      alert(err?.message || 'Failed to delete driver.');
    }
  };

  const isLicenseExpiringSoon = (expiry: string) => {
    const exp = new Date(expiry);
    const now = new Date();
    const diff = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff <= 30 && diff >= 0;
  };

  const isLicenseExpired = (expiry: string) => new Date(expiry) < new Date();

  const filtered = drivers.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = !q || d.driver_name.toLowerCase().includes(q) || d.contact.includes(q) || d.license_number.toLowerCase().includes(q);
    const matchStatus = !filterStatus || d.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow">
            <UserCheck className="size-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">Drivers</h2>
            <p className="text-sm text-slate-500">{drivers.length} registered driver{drivers.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        {isAdmin && (
          <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
            <Plus className="size-4" /> New Driver
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text" placeholder="Search name, contact, license…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-slate-800 dark:border-slate-600 dark:text-white"
        />
        <div className="relative">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 pr-8 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-slate-800 dark:border-slate-600 dark:text-white">
            <option value="">All Statuses</option>
            <option>Active</option>
            <option>Inactive</option>
            <option>On Leave</option>
          </select>
          <ChevronDown className="absolute right-2 top-2.5 size-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-slate-400">Loading drivers…</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-400">
          <UserCheck className="size-10 opacity-30" />
          <p>{search || filterStatus ? 'No drivers match filters.' : 'No drivers yet. Add your first driver.'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase text-xs tracking-wide">
              <tr>
                <th className="text-left px-4 py-3">Driver</th>
                <th className="text-left px-4 py-3">Contact</th>
                <th className="text-left px-4 py-3">Assigned Vehicle</th>
                <th className="text-left px-4 py-3">License</th>
                <th className="text-left px-4 py-3">Status</th>
                {isAdmin && <th className="text-left px-4 py-3">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {filtered.map(d => (
                <tr key={d.id} className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm">
                        {d.driver_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-slate-800 dark:text-white">{d.driver_name}</div>
                        <div className="text-xs text-slate-400">Joined {new Date(d.join_date).toLocaleDateString()}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    <div>{d.contact}</div>
                    {d.email && <div className="text-xs text-slate-400">{d.email}</div>}
                  </td>
                  <td className="px-4 py-3">
                    {d.vehicle_name ? (
                      <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                        <Car className="size-3.5 text-blue-400" />
                        <span>{d.vehicle_name}</span>
                        {d.plate_number && <span className="text-xs text-slate-400">({d.plate_number})</span>}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-xs">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs font-mono text-slate-600 dark:text-slate-300">{d.license_number}</div>
                    <div className={`text-xs mt-0.5 flex items-center gap-1 ${isLicenseExpired(d.license_expiry) ? 'text-red-600 font-semibold' : isLicenseExpiringSoon(d.license_expiry) ? 'text-amber-500' : 'text-slate-400'}`}>
                      {(isLicenseExpired(d.license_expiry) || isLicenseExpiringSoon(d.license_expiry)) && <AlertCircle className="size-3" />}
                      Exp: {new Date(d.license_expiry).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_COLORS[d.status] || STATUS_COLORS.Inactive}`}>
                      {d.status}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(d)} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 transition-colors" title="Edit">
                          <Pencil className="size-4" />
                        </button>
                        <button onClick={() => setDeleteConfirm(d.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition-colors" title="Delete">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                {editDriver ? 'Edit Driver' : 'New Driver'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <X className="size-5 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-3 py-2">{formError}</div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Driver Name <span className="text-red-500">*</span></label>
                  <input type="text" value={form.driver_name} onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                    placeholder="Full name" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Phone <span className="text-red-500">*</span></label>
                  <input type="text" value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                    placeholder="+63 9XX XXXX XXXX" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                    placeholder="Optional" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">License No. <span className="text-red-500">*</span></label>
                  <input type="text" value={form.license_number} onChange={e => setForm(f => ({ ...f, license_number: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                    placeholder="License number" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">License Expiry <span className="text-red-500">*</span></label>
                  <input type="date" value={form.license_expiry} onChange={e => setForm(f => ({ ...f, license_expiry: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-slate-800 dark:border-slate-600 dark:text-white" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Join Date <span className="text-red-500">*</span></label>
                  <input type="date" value={form.join_date} onChange={e => setForm(f => ({ ...f, join_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-slate-800 dark:border-slate-600 dark:text-white" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-slate-800 dark:border-slate-600 dark:text-white">
                    <option>Active</option>
                    <option>Inactive</option>
                    <option>On Leave</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Assigned Vehicle</label>
                  <select value={form.assigned_vehicle_id} onChange={e => setForm(f => ({ ...f, assigned_vehicle_id: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-slate-800 dark:border-slate-600 dark:text-white">
                    <option value="">None</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>{v.unit_name}{v.plate_number ? ` (${v.plate_number})` : ''}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 pb-6">
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
                {saving ? 'Saving…' : editDriver ? 'Update Driver' : 'Create Driver'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Delete Driver?</h3>
            <p className="text-sm text-slate-500 mb-5">This action cannot be undone. The driver will be removed from all deliveries.</p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
              <Button onClick={() => handleDelete(deleteConfirm)} className="bg-red-500 hover:bg-red-600 text-white">Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
