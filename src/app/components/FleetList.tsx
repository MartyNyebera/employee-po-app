import { useEffect, useState } from 'react';
import { fetchVehicles, seedFleet, type Vehicle, type PmsStatus } from '../api/fleet';
import { Button } from './ui/button';
import { Plus, Truck, AlertTriangle, CheckCircle, Clock, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { AddVehicleModal } from './AddVehicleModal';

interface FleetListProps {
  onSelectVehicle: (id: string) => void;
}

function PmsBadge({ status }: { status: PmsStatus | undefined }) {
  if (status === 'OVERDUE') return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
      <AlertTriangle className="size-3" /> Overdue
    </span>
  );
  if (status === 'DUE_SOON') return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
      <Clock className="size-3" /> Due Soon
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
      <CheckCircle className="size-3" /> OK
    </span>
  );
}

const TYPE_ICONS: Record<string, string> = {
  'Dump Truck': '🚛',
  'Mini Dump': '🚚',
  'Backhoe': '🚜',
  'Boom Truck': '🏗️',
  'L3 Loader': '⚙️',
};

export function FleetList({ onSelectVehicle }: FleetListProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const data = await fetchVehicles();
      setVehicles(data);
    } catch (err: any) {
      toast.error('Failed to load vehicles: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSeed = async () => {
    try {
      setSeeding(true);
      await seedFleet();
      toast.success('Fleet data seeded!');
      load();
    } catch (err: any) {
      toast.error('Seed failed: ' + err.message);
    } finally {
      setSeeding(false);
    }
  };

  const overdue = vehicles.filter(v => v.pms_status === 'OVERDUE').length;
  const dueSoon = vehicles.filter(v => v.pms_status === 'DUE_SOON').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Fleet Management</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{vehicles.length} vehicles registered</p>
        </div>
        <div className="flex gap-2">
          {vehicles.length === 0 && (
            <Button variant="outline" size="sm" onClick={handleSeed} disabled={seeding}>
              {seeding ? 'Seeding...' : '📦 Load Initial Data'}
            </Button>
          )}
          <Button size="sm" onClick={() => setShowAddModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="size-4 mr-1" /> Add Vehicle
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {vehicles.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{vehicles.length}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Total Vehicles</div>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800 shadow-sm">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{overdue}</div>
            <div className="text-sm text-red-500 dark:text-red-400">Overdue PMS</div>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-4 border border-yellow-200 dark:border-yellow-800 shadow-sm">
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{dueSoon}</div>
            <div className="text-sm text-yellow-500 dark:text-yellow-400">Due Soon</div>
          </div>
        </div>
      )}

      {/* Vehicle List */}
      {loading ? (
        <div className="text-center py-12 text-slate-500">Loading vehicles...</div>
      ) : vehicles.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <Truck className="size-12 mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">No Vehicles Yet</h3>
          <p className="text-slate-500 mb-4">Click "Load Initial Data" to add your fleet, or add vehicles manually.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {vehicles.map(vehicle => (
            <div
              key={vehicle.id}
              className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => onSelectVehicle(vehicle.id)}
            >
              <div className="flex items-center gap-4">
                <div className="text-3xl">{TYPE_ICONS[vehicle.vehicle_type] || '🚗'}</div>
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">{vehicle.unit_name}</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    {vehicle.vehicle_type}
                    {vehicle.plate_number && ` · ${vehicle.plate_number}`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right hidden sm:block">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    {Number(vehicle.current_odometer).toLocaleString()} km
                  </div>
                  <div className="text-xs text-slate-500">Current Odometer</div>
                </div>
                <PmsBadge status={vehicle.pms_status} />
                <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); onSelectVehicle(vehicle.id); }}>
                  View Details
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <AddVehicleModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => { setShowAddModal(false); load(); }}
        />
      )}
    </div>
  );
}
