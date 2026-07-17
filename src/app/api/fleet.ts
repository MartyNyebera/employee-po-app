// Fleet feature removed (vehicles / PMS / maintenance / odometer / fleet POs).
// The fleet backend routes and database tables no longer exist. This module is kept
// only as a compatibility shim so a few surviving components (Sales Orders,
// Transactions, Purchase Orders) that referenced an optional vehicle picker still
// compile — every call now resolves to empty data / no-op instead of hitting the API.

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

const removed = (): never => {
  throw new Error('Fleet feature has been removed');
};

// Vehicles — reads return empty, mutations are unsupported.
export const fetchVehicles = async (): Promise<Vehicle[]> => [];
export const fetchVehicle = async (_id: string): Promise<Vehicle | null> => null;
export const createVehicle = async (_data: Partial<Vehicle>): Promise<Vehicle> => removed();
export const updateVehicle = async (_id: string, _data: Partial<Vehicle>): Promise<Vehicle> => removed();
export const deleteVehicle = async (_id: string): Promise<void> => {};

// Odometer
export const fetchOdometerLogs = async (_vehicleId: string): Promise<OdometerLog[]> => [];
export const logOdometer = async (_vehicleId: string, _odometer: number, _source = 'manual'): Promise<void> => {};

// Maintenance
export const fetchMaintenance = async (_vehicleId: string): Promise<MaintenanceRecord[]> => [];
export const createMaintenance = async (_vehicleId: string, _data: Partial<MaintenanceRecord>): Promise<MaintenanceRecord> => removed();

// Purchase Orders
export const fetchVehiclePOs = async (_vehicleId: string): Promise<FleetPO[]> => [];
export const createVehiclePO = async (_vehicleId: string, _data: Partial<FleetPO>): Promise<FleetPO> => removed();

// PMS Reminders
export const fetchPmsReminders = async (): Promise<Vehicle[]> => [];
