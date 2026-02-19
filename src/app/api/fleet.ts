import { getStoredAuth } from './client';

function getAuthHeaders(): Record<string, string> {
  const auth = getStoredAuth();
  return {
    'Content-Type': 'application/json',
    ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
  };
}

async function fleetFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api/fleet${path}`, {
    ...options,
    headers: { ...getAuthHeaders(), ...options?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export type VehicleType = 'Dump Truck' | 'Mini Dump' | 'Backhoe' | 'Boom Truck' | 'L3 Loader';
export type PmsStatus = 'OK' | 'DUE_SOON' | 'OVERDUE';

export interface Vehicle {
  id: string;
  unit_name: string;
  vehicle_type: VehicleType;
  plate_number: string | null;
  current_odometer: number;
  tracker_id: string | null;
  created_at: string;
  updated_at: string;
  pms_status?: PmsStatus;
  next_due_date?: string | null;
  next_due_odometer?: number | null;
  last_service_date?: string | null;
}

export interface OdometerLog {
  id: string;
  vehicle_id: string;
  odometer: number;
  recorded_at: string;
  source: 'manual' | 'gps' | 'service';
}

export interface MaintenanceRecord {
  id: string;
  vehicle_id: string;
  service_date: string;
  odometer_at_service: number | null;
  description: string;
  total_cost: number;
  next_due_date: string | null;
  next_due_odometer: number | null;
  created_at: string;
}

export interface POItem {
  id: string;
  purchase_order_id: string;
  part_name: string;
  quantity: number;
  unit_cost: number;
  subtotal: number;
}

export interface FleetPO {
  id: string;
  vehicle_id: string;
  po_number: string;
  supplier: string | null;
  date: string;
  total_cost: number;
  notes: string | null;
  items?: POItem[];
}

export const VEHICLE_TYPES: VehicleType[] = [
  'Dump Truck', 'Mini Dump', 'Backhoe', 'Boom Truck', 'L3 Loader'
];

// Vehicles
export const fetchVehicles = () => fleetFetch<Vehicle[]>('/vehicles');
export const fetchVehicle = (id: string) => fleetFetch<Vehicle>(`/vehicles/${id}`);
export const createVehicle = (data: Partial<Vehicle>) =>
  fleetFetch<Vehicle>('/vehicles', { method: 'POST', body: JSON.stringify(data) });
export const updateVehicle = (id: string, data: Partial<Vehicle>) =>
  fleetFetch<Vehicle>(`/vehicles/${id}`, { method: 'PUT', body: JSON.stringify(data) });

// Odometer
export const fetchOdometerLogs = (vehicleId: string) =>
  fleetFetch<OdometerLog[]>(`/vehicles/${vehicleId}/odometer-logs`);
export const logOdometer = (vehicleId: string, odometer: number, source = 'manual') =>
  fleetFetch(`/vehicles/${vehicleId}/odometer`, { method: 'POST', body: JSON.stringify({ odometer, source }) });

// Maintenance
export const fetchMaintenance = (vehicleId: string) =>
  fleetFetch<MaintenanceRecord[]>(`/vehicles/${vehicleId}/maintenance`);
export const createMaintenance = (vehicleId: string, data: Partial<MaintenanceRecord>) =>
  fleetFetch<MaintenanceRecord>(`/vehicles/${vehicleId}/maintenance`, { method: 'POST', body: JSON.stringify(data) });

// Purchase Orders
export const fetchVehiclePOs = (vehicleId: string) =>
  fleetFetch<FleetPO[]>(`/vehicles/${vehicleId}/purchase-orders`);
export const createVehiclePO = (vehicleId: string, data: Partial<FleetPO>) =>
  fleetFetch<FleetPO>(`/vehicles/${vehicleId}/purchase-orders`, { method: 'POST', body: JSON.stringify(data) });

// PMS Reminders
export const fetchPmsReminders = () => fleetFetch<Vehicle[]>('/pms-reminders');

// Seed
export const seedFleet = () => fleetFetch('/seed', { method: 'POST' });
