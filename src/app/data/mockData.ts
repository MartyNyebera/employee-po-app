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

export const mockAssets: Asset[] = [
  {
    id: 'TRK-001',
    name: 'Delivery Truck Alpha',
    type: 'truck',
    status: 'active',
    location: 'Manila Construction Site',
    coordinates: { lat: 14.5995, lng: 120.9842 },
    engineHours: 2847,
    idleTime: 45,
    fuelLevel: 68,
    batteryVoltage: 12.8,
    speed: 42,
    inGeofence: true,
    lastUpdate: '2 min ago',
    driver: 'Juan Santos',
    efficiencyScore: 87,
  },
  {
    id: 'BCK-002',
    name: 'Backhoe Beta',
    type: 'backhoe',
    status: 'idle',
    location: 'Quezon City Warehouse',
    coordinates: { lat: 14.6760, lng: 121.0437 },
    engineHours: 1523,
    idleTime: 120,
    fuelLevel: 34,
    batteryVoltage: 11.9,
    speed: 0,
    inGeofence: true,
    lastUpdate: '5 min ago',
    driver: 'Maria Cruz',
    efficiencyScore: 62,
  },
  {
    id: 'EXC-003',
    name: 'Excavator Gamma',
    type: 'excavator',
    status: 'active',
    location: 'BGC Tower Project',
    coordinates: { lat: 14.5547, lng: 121.0244 },
    engineHours: 3921,
    idleTime: 28,
    fuelLevel: 89,
    batteryVoltage: 13.2,
    speed: 15,
    inGeofence: true,
    lastUpdate: '1 min ago',
    driver: 'Pedro Reyes',
    efficiencyScore: 94,
  },
  {
    id: 'TRK-004',
    name: 'Delivery Truck Delta',
    type: 'truck',
    status: 'offline',
    location: 'Main Depot',
    coordinates: { lat: 14.5832, lng: 120.9668 },
    engineHours: 4156,
    idleTime: 0,
    fuelLevel: 12,
    batteryVoltage: 10.8,
    speed: 0,
    inGeofence: false,
    lastUpdate: '2 hours ago',
    efficiencyScore: 71,
  },
  {
    id: 'BCK-005',
    name: 'Backhoe Epsilon',
    type: 'backhoe',
    status: 'active',
    location: 'Makati Office Complex',
    coordinates: { lat: 14.5547, lng: 121.0244 },
    engineHours: 892,
    idleTime: 15,
    fuelLevel: 91,
    batteryVoltage: 12.6,
    speed: 8,
    inGeofence: true,
    lastUpdate: '1 min ago',
    driver: 'Rosa Martinez',
    efficiencyScore: 91,
  },
];

export const mockPurchaseOrders: PurchaseOrder[] = [
  {
    id: 'PO-001',
    poNumber: 'PO-2026-0234',
    client: 'ABC Construction Corp.',
    description: 'Site excavation and foundation work',
    amount: 850000,
    status: 'in-progress',
    createdDate: '2026-02-01',
    deliveryDate: '2026-02-28',
    assignedAssets: ['EXC-003', 'BCK-002'],
  },
  {
    id: 'PO-002',
    poNumber: 'PO-2026-0235',
    client: 'Metro Development Inc.',
    description: 'Heavy equipment rental for 3 months',
    amount: 1250000,
    status: 'approved',
    createdDate: '2026-02-05',
    deliveryDate: '2026-05-05',
    assignedAssets: ['TRK-001', 'BCK-005'],
  },
  {
    id: 'PO-003',
    poNumber: 'PO-2026-0236',
    client: 'BuildRight Solutions',
    description: 'Material delivery and excavation support',
    amount: 425000,
    status: 'pending',
    createdDate: '2026-02-10',
    deliveryDate: '2026-03-15',
    assignedAssets: ['TRK-004'],
  },
  {
    id: 'PO-004',
    poNumber: 'PO-2026-0237',
    client: 'Skyline Realty Group',
    description: 'Tower foundation excavation',
    amount: 2100000,
    status: 'completed',
    createdDate: '2026-01-15',
    deliveryDate: '2026-02-10',
    assignedAssets: ['EXC-003', 'BCK-002', 'TRK-001'],
  },
];

export const mockTransactions: Transaction[] = [
  {
    id: 'TXN-001',
    poNumber: 'PO-2026-0234',
    type: 'fuel',
    description: 'Diesel refill - 150L',
    amount: 9750,
    assetId: 'EXC-003',
    date: '2026-02-11',
  },
  {
    id: 'TXN-002',
    poNumber: 'PO-2026-0235',
    type: 'maintenance',
    description: 'Oil change and filter replacement',
    amount: 4500,
    assetId: 'TRK-001',
    date: '2026-02-10',
  },
  {
    id: 'TXN-003',
    poNumber: 'PO-2026-0234',
    type: 'parts',
    description: 'Hydraulic hose replacement',
    amount: 12800,
    assetId: 'BCK-002',
    date: '2026-02-09',
  },
  {
    id: 'TXN-004',
    poNumber: 'PO-2026-0237',
    type: 'fuel',
    description: 'Diesel refill - 200L',
    amount: 13000,
    assetId: 'TRK-001',
    date: '2026-02-08',
  },
  {
    id: 'TXN-005',
    poNumber: 'PO-2026-0235',
    type: 'maintenance',
    description: 'Tire replacement (set of 4)',
    amount: 28000,
    assetId: 'BCK-005',
    date: '2026-02-07',
  },
  {
    id: 'TXN-006',
    poNumber: 'PO-2026-0234',
    type: 'fuel',
    description: 'Diesel refill - 120L',
    amount: 7800,
    assetId: 'BCK-002',
    date: '2026-02-12',
  },
];

export const getAssetById = (id: string) => mockAssets.find(asset => asset.id === id);
export const getPOById = (id: string) => mockPurchaseOrders.find(po => po.id === id);
