import { useState, useEffect } from 'react';
import { Truck, User, RefreshCw, CheckCircle, X } from 'lucide-react';
import { fetchApi } from '../api/client';

interface DriverAccount {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  license_number: string;
  vehicle_id: string | null;
  vehicle_name: string | null;
  plate_number: string | null;
  current_odometer: number | null;
  status: string;
}

interface Vehicle {
  id: string;
  unit_name: string;
  plate_number: string;
  vehicle_type: string;
  current_odometer: number;
}

export function DriverVehicleAssignment() {
  const [drivers, setDrivers] = useState<DriverAccount[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Record<number, string>>({});

  const loadData = async () => {
    setLoading(true);
    try {
      const [driverData, vehicleData] = await Promise.all([
        fetchApi('/admin/drivers/accounts'),
        fetchApi('/fleet/vehicles'),
      ]);
      const driverList: DriverAccount[] = Array.isArray(driverData) ? driverData : [];
      const vehicleList: Vehicle[] = Array.isArray(vehicleData) ? vehicleData : [];
      setDrivers(driverList);
      setVehicles(vehicleList);
      const initSelected: Record<number, string> = {};
      driverList.forEach((d: DriverAccount) => {
        initSelected[d.id] = d.vehicle_id || '';
      });
      setSelectedVehicle(initSelected);
    } catch (err) {
      console.error('Failed to load driver/vehicle data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleAssign = async (driverId: number) => {
    setSaving(driverId);
    try {
      await fetchApi(`/admin/drivers/${driverId}/assign-vehicle`, {
        method: 'PUT',
        body: JSON.stringify({ vehicle_id: selectedVehicle[driverId] || null }),
      });
      await loadData();
    } catch (err) {
      alert('Failed to assign vehicle. Please try again.');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Loading drivers...
      </div>
    );
  }

  if (drivers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-gray-400">
        <User className="w-10 h-10 mb-3 text-gray-300" />
        <p className="font-medium text-gray-500">No approved drivers yet</p>
        <p className="text-sm mt-1">Approve driver accounts first to assign vehicles</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Driver Vehicle Assignment</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Assign vehicles to drivers. GPS tracking will auto-update the vehicle's odometer.
          </p>
        </div>
        <button
          onClick={loadData}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3">
        {drivers.map(driver => (
          <div key={driver.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start gap-3">
              {/* Driver Info */}
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{driver.full_name}</p>
                <p className="text-xs text-gray-500">{driver.email} · License: {driver.license_number}</p>

                {/* Current Assignment Badge */}
                {driver.vehicle_name ? (
                  <div className="flex items-center gap-1.5 mt-2">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                    <span className="text-xs text-green-700 font-medium">
                      {driver.vehicle_name} ({driver.plate_number})
                    </span>
                    <span className="text-xs text-gray-400">
                      · ODO: {parseFloat(String(driver.current_odometer || 0)).toLocaleString('en-PH', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-2">
                    <X className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-xs text-gray-400">No vehicle assigned</span>
                  </div>
                )}

                {/* Vehicle Selector */}
                <div className="flex items-center gap-2 mt-3">
                  <div className="flex-1 relative">
                    <Truck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <select
                      value={selectedVehicle[driver.id] || ''}
                      onChange={e => setSelectedVehicle(prev => ({ ...prev, [driver.id]: e.target.value }))}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">— No Vehicle —</option>
                      {vehicles.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.unit_name} ({v.plate_number}) · {parseFloat(String(v.current_odometer || 0)).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} km
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => handleAssign(driver.id)}
                    disabled={saving === driver.id}
                    className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                  >
                    {saving === driver.id ? 'Saving...' : 'Assign'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <p className="text-xs font-semibold text-blue-800 mb-1">How GPS ODO tracking works</p>
        <p className="text-xs text-blue-700">
          Once a vehicle is assigned, the driver's GPS pings (every 15 seconds) are used to calculate
          the distance traveled via Haversine formula. Each trip automatically adds kilometers to the
          vehicle's odometer in real time.
        </p>
      </div>
    </div>
  );
}
