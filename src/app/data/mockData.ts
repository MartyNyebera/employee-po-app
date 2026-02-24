export interface Asset {
  id: string;
  name: string;
  type: 'truck' | 'backhoe' | 'excavator';
  status: 'active' | 'idle' | 'offline';
  location: string;
  coordinates: { lat: number; lng: number };
  engineHours: number;
  idleTime: number; // minutes
  fuelLevel: number; // percentage
  batteryVoltage: number;
  speed: number; // km/h
  inGeofence: boolean;
  lastUpdate: string;
  driver?: string;
  efficiencyScore: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  client: string;
  description: string;
  amount: number;
  status: 'pending' | 'approved' | 'in-progress' | 'completed';
  createdDate: string;
  deliveryDate: string;
  assignedAssets: string[];
}

export interface Transaction {
  id: string;
  poNumber: string;
  type: 'fuel' | 'maintenance' | 'parts' | 'rental';
  description: string;
  amount: number;
  assetId: string;
  date: string;
  receipt?: string;
}

export const mockAssets: Asset[] = []; // Empty - will be populated by real API data
export const mockPurchaseOrders: PurchaseOrder[] = []; // Empty - will be populated by real API data
export const mockTransactions: Transaction[] = []; // Empty - will be populated by real API data

export const getAssetById = (id: string) => mockAssets.find(asset => asset.id === id);
export const getPOById = (id: string) => mockPurchaseOrders.find(po => po.id === id);
