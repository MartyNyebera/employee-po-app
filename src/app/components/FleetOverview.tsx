import { useState, useEffect } from 'react';
import { fetchVehicles, deleteVehicle, type Vehicle } from '../api/fleet';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { 
  Truck, 
  Activity, 
  AlertTriangle, 
  Gauge,
  Clock,
  Trash
} from 'lucide-react';
import { toast } from 'sonner';

interface FleetOverviewProps {
  onAssetClick: (assetId: string) => void;
}

export function FleetOverview({ onAssetClick }: FleetOverviewProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVehicles()
      .then(data => {
        if (!Array.isArray(data)) {
          throw new Error('API returned non-array data');
        }
        setVehicles(data);
      })
      .catch(() => setVehicles([]))
      .finally(() => setLoading(false));
  }, []);

  const handleDeleteVehicle = async (vehicleId: string, vehicleName: string) => {
    if (!confirm(`Are you sure you want to delete "${vehicleName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteVehicle(vehicleId);
      toast.success(`Vehicle "${vehicleName}" deleted successfully`);
      // Refresh the vehicle list
      fetchVehicles()
        .then(data => {
          if (!Array.isArray(data)) {
            throw new Error('API returned non-array data');
          }
          setVehicles(data);
        })
        .catch(() => setVehicles([]));
    } catch (error: any) {
      toast.error('Failed to delete vehicle: ' + error.message);
    }
  };

  // Vehicle stats based on PMS status since vehicles don't have status field
  const overdueCount = vehicles.filter(v => v.pms_status === 'OVERDUE').length;
  const dueSoonCount = vehicles.filter(v => v.pms_status === 'DUE_SOON').length;
  const okCount = vehicles.filter(v => v.pms_status === 'OK' || !v.pms_status).length;
  const totalOdometer = vehicles.reduce((sum, v) => sum + v.current_odometer, 0);

  
  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[280px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />
          <span className="text-sm font-medium text-slate-500">Loading fleet...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5 hover:shadow-xl hover:shadow-slate-900/10 hover:-translate-y-1 transition-all duration-300 border-l-4 border-l-emerald-500 dark:bg-slate-800/30 dark:border dark:border-white/10 dark:shadow-xl dark:shadow-black/20 dark:hover:shadow-2xl dark:hover:shadow-black/30 dark:hover:brightness-110 dark:border-l-emerald-500">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg dark:bg-emerald-500/20">
                <Activity className="size-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-xs font-medium text-slate-600 uppercase tracking-widerest dark:text-slate-400">Active</span>
            </div>
            <div className="text-3xl font-bold text-slate-900 dark:text-white">{okCount}</div>
          </CardContent>
        </Card>
        
        <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5 hover:shadow-xl hover:shadow-slate-900/10 hover:-translate-y-1 transition-all duration-300 border-l-4 border-l-amber-500 dark:bg-slate-800/30 dark:border dark:border-white/10 dark:shadow-xl dark:shadow-black/20 dark:hover:shadow-2xl dark:hover:shadow-black/30 dark:hover:brightness-110 dark:border-l-amber-500">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-amber-500/10 rounded-lg dark:bg-amber-500/20">
                <Clock className="size-5 text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-xs font-medium text-slate-600 uppercase tracking-widerest dark:text-slate-400">Due Soon</span>
            </div>
            <div className="text-3xl font-bold text-slate-900 dark:text-white">{dueSoonCount}</div>
          </CardContent>
        </Card>
        
        <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5 hover:shadow-xl hover:shadow-slate-900/10 hover:-translate-y-1 transition-all duration-300 border-l-4 border-l-rose-500 dark:bg-slate-800/30 dark:border dark:border-white/10 dark:shadow-xl dark:shadow-black/20 dark:hover:shadow-2xl dark:hover:shadow-black/30 dark:hover:brightness-110 dark:border-l-rose-500">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-rose-500/10 rounded-lg dark:bg-rose-500/20">
                <AlertTriangle className="size-5 text-rose-600 dark:text-rose-400" />
              </div>
              <span className="text-xs font-medium text-slate-600 uppercase tracking-widerest dark:text-slate-400">Overdue</span>
            </div>
            <div className="text-3xl font-bold text-slate-900 dark:text-white">{overdueCount}</div>
          </CardContent>
        </Card>
        
        <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5 hover:shadow-xl hover:shadow-slate-900/10 hover:-translate-y-1 transition-all duration-300 border-l-4 border-l-blue-500 dark:bg-slate-800/30 dark:border dark:border-white/10 dark:shadow-xl dark:shadow-black/20 dark:hover:shadow-2xl dark:hover:shadow-black/30 dark:hover:brightness-110 dark:border-l-blue-500">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-blue-500/10 rounded-lg dark:bg-blue-500/20">
                <Truck className="size-5 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-xs font-medium text-slate-600 uppercase tracking-widerest dark:text-slate-400">Total Vehicles</span>
            </div>
            <div className="text-3xl font-bold text-slate-900 dark:text-white">{vehicles.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Fleet List */}
      <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5 overflow-hidden dark:bg-slate-800/50 dark:border dark:border-white/10 dark:shadow-xl dark:shadow-black/20 dark:hover:shadow-2xl dark:hover:shadow-black/30">
        <CardHeader className="border-b border-slate-200/60 bg-slate-50/50 px-6 py-4 dark:border-b dark:border-slate-700/50 dark:bg-slate-800/30">
          <CardTitle className="flex items-center gap-3 text-slate-900 font-semibold dark:text-slate-100">
            <div className="p-2 bg-slate-100 rounded-lg dark:bg-slate-700/50">
              <Truck className="size-5 text-slate-600 dark:text-slate-300" />
            </div>
            Fleet vehicles ({vehicles.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-200/60 dark:divide-y dark:divide-slate-700/30">
            {vehicles.length === 0 ? (
              <div className="p-12 text-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center dark:bg-slate-700/50">
                    <Truck className="size-8 text-slate-400 dark:text-slate-500" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No vehicles yet</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Add your first vehicle to get started with fleet tracking.</p>
                  </div>
                </div>
              </div>
            ) : (
              vehicles.map((vehicle) => (
              <button
                key={vehicle.id}
                onClick={() => onAssetClick(vehicle.id)}
                className="w-full p-6 hover:bg-slate-50/80 transition-all duration-300 text-left hover:shadow-lg hover:shadow-slate-900/10 group dark:hover:bg-slate-700/50 dark:hover:shadow-lg dark:hover:shadow-black/20 dark:hover:brightness-105 dark:border-b dark:border-transparent"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`size-3 rounded-full bg-green-500 shadow-lg shadow-current/50`} />
                      <span className="font-bold text-lg text-slate-900 dark:text-slate-100">{vehicle.unit_name}</span>
                    </div>
                    <div className="text-sm text-slate-500 font-mono dark:text-slate-400">{vehicle.id}</div>
                  </div>
                  {vehicle.pms_status && (
                    <Badge className={
                      vehicle.pms_status === 'OVERDUE' ? 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800' :
                      vehicle.pms_status === 'DUE_SOON' ? 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800' :
                      'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800'
                    }>
                      {vehicle.pms_status}
                    </Badge>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                    <div className="p-1.5 bg-blue-100 rounded-lg dark:bg-blue-500/20">
                      <Gauge className="size-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <span className="font-semibold">Type: {vehicle.vehicle_type}</span>
                  </div>

                  {vehicle.plate_number && (
                    <div className="text-sm text-slate-600 flex items-center gap-2 dark:text-slate-300">
                      <span className="text-slate-500 dark:text-slate-500">Plate:</span>
                      <span className="font-medium">{vehicle.plate_number}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                    <div className="p-1.5 bg-orange-100 rounded-lg dark:bg-orange-500/20">
                      <Gauge className="size-4 text-orange-600 dark:text-orange-400" />
                    </div>
                    <span className="font-semibold">Odometer: {vehicle.current_odometer.toLocaleString()} km</span>
                  </div>

                  {vehicle.tracker_id && (
                    <div className="text-sm text-slate-600 flex items-center gap-2 dark:text-slate-300">
                      <span className="text-slate-500 dark:text-slate-500">Tracker ID:</span>
                      <span className="font-medium">{vehicle.tracker_id}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-200/60 dark:border-t dark:border-slate-700/30">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Updated: {new Date(vehicle.updated_at).toLocaleDateString()}</div>
                  <div className="flex items-center gap-3">
                    {vehicle.pms_status && (
                      <div className={`text-xs font-semibold ${
                        vehicle.pms_status === 'OVERDUE' ? 'text-red-600 dark:text-red-400' :
                        vehicle.pms_status === 'DUE_SOON' ? 'text-yellow-600 dark:text-yellow-400' :
                        'text-green-600 dark:text-green-400'
                      }`}>
                        PMS: {vehicle.pms_status}
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteVehicle(vehicle.id, vehicle.unit_name);
                      }}
                      className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors dark:hover:bg-red-900/20"
                      title="Delete vehicle"
                    >
                      <Trash className="size-4" />
                    </button>
                  </div>
                </div>
              </button>
              )))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
