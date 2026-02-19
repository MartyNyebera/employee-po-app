import { useEffect, useState } from 'react';
import { fetchPmsReminders, type Vehicle } from '../api/fleet';
import { Button } from './ui/button';
import { AlertTriangle, Clock, Wrench } from 'lucide-react';
import { toast } from 'sonner';

interface PMSRemindersProps {
  onSelectVehicle: (id: string) => void;
}

const TYPE_ICONS: Record<string, string> = {
  'Dump Truck': '🚛', 'Mini Dump': '🚚', 'Backhoe': '🚜', 'Boom Truck': '🏗️', 'L3 Loader': '⚙️',
};

export function PMSReminders({ onSelectVehicle }: PMSRemindersProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPmsReminders()
      .then(setVehicles)
      .catch(err => toast.error('Failed to load reminders: ' + err.message))
      .finally(() => setLoading(false));
  }, []);

  const overdue = vehicles.filter(v => v.pms_status === 'OVERDUE');
  const dueSoon = vehicles.filter(v => v.pms_status === 'DUE_SOON');

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">PMS Reminders</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Vehicles requiring maintenance attention</p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">Loading...</div>
      ) : vehicles.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="text-4xl mb-4">✅</div>
          <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">All Vehicles OK</h3>
          <p className="text-slate-500">No vehicles are overdue or due soon for maintenance.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Overdue */}
          {overdue.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-red-500" />
                <h2 className="font-semibold text-red-600 dark:text-red-400">Overdue ({overdue.length})</h2>
              </div>
              {overdue.map(v => (
                <VehicleReminderCard key={v.id} vehicle={v} onSelect={onSelectVehicle} />
              ))}
            </div>
          )}

          {/* Due Soon */}
          {dueSoon.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="size-5 text-yellow-500" />
                <h2 className="font-semibold text-yellow-600 dark:text-yellow-400">Due Soon ({dueSoon.length})</h2>
              </div>
              {dueSoon.map(v => (
                <VehicleReminderCard key={v.id} vehicle={v} onSelect={onSelectVehicle} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VehicleReminderCard({ vehicle, onSelect }: { vehicle: Vehicle; onSelect: (id: string) => void }) {
  const isOverdue = vehicle.pms_status === 'OVERDUE';
  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl border p-4 flex items-center justify-between ${
      isOverdue ? 'border-red-200 dark:border-red-800' : 'border-yellow-200 dark:border-yellow-800'
    }`}>
      <div className="flex items-center gap-4">
        <div className="text-3xl">{TYPE_ICONS[vehicle.vehicle_type] || '🚗'}</div>
        <div>
          <div className="font-semibold text-slate-900 dark:text-white">{vehicle.unit_name}</div>
          <div className="text-sm text-slate-500">{vehicle.vehicle_type}</div>
          <div className="text-sm mt-1 space-x-3">
            {vehicle.next_due_date && (
              <span className={isOverdue ? 'text-red-500' : 'text-yellow-600'}>
                📅 Due: {vehicle.next_due_date}
              </span>
            )}
            {vehicle.next_due_odometer && (
              <span className={isOverdue ? 'text-red-500' : 'text-yellow-600'}>
                🔢 Due at: {Number(vehicle.next_due_odometer).toLocaleString()} km
              </span>
            )}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Current odometer: {Number(vehicle.current_odometer).toLocaleString()} km
          </div>
        </div>
      </div>
      <Button
        size="sm"
        onClick={() => onSelect(vehicle.id)}
        className={isOverdue ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-yellow-500 hover:bg-yellow-600 text-white'}
      >
        <Wrench className="size-4 mr-1" /> Maintain
      </Button>
    </div>
  );
}
