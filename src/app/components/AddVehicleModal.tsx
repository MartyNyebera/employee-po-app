import { useState } from 'react';
import { createVehicle, VEHICLE_TYPES, type VehicleType } from '../api/fleet';
import { Button } from './ui/button';
import { X } from 'lucide-react';
import { toast } from 'sonner';

interface AddVehicleModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function AddVehicleModal({ onClose, onCreated }: AddVehicleModalProps) {
  const [form, setForm] = useState({
    unit_name: '',
    vehicle_type: 'Dump Truck' as VehicleType,
    plate_number: '',
    current_odometer: '',
    tracker_id: '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.unit_name || !form.vehicle_type) {
      toast.error('Unit name and vehicle type are required');
      return;
    }
    try {
      setLoading(true);
      await createVehicle({
        unit_name: form.unit_name,
        vehicle_type: form.vehicle_type,
        plate_number: form.plate_number || null,
        current_odometer: parseFloat(form.current_odometer) || 0,
        tracker_id: form.tracker_id || null,
      });
      toast.success('Vehicle added successfully!');
      onCreated();
    } catch (err: any) {
      toast.error('Failed to add vehicle: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Add New Vehicle</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="size-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Unit Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.unit_name}
              onChange={e => setForm(f => ({ ...f, unit_name: e.target.value }))}
              placeholder="e.g. Dump Truck 3"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Vehicle Type <span className="text-red-500">*</span>
            </label>
            <select
              value={form.vehicle_type}
              onChange={e => setForm(f => ({ ...f, vehicle_type: e.target.value as VehicleType }))}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Plate Number
            </label>
            <input
              type="text"
              value={form.plate_number}
              onChange={e => setForm(f => ({ ...f, plate_number: e.target.value }))}
              placeholder="e.g. ABC 1234 (optional)"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Starting Odometer (km)
            </label>
            <input
              type="number"
              value={form.current_odometer}
              onChange={e => setForm(f => ({ ...f, current_odometer: e.target.value }))}
              placeholder="0"
              min="0"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Tracker ID (optional)
            </label>
            <input
              type="text"
              value={form.tracker_id}
              onChange={e => setForm(f => ({ ...f, tracker_id: e.target.value }))}
              placeholder="GPS tracker device ID"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" disabled={loading}>
              {loading ? 'Adding...' : 'Add Vehicle'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
