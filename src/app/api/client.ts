import type { Asset, PurchaseOrder, Transaction } from '../data/mockData';
import { CONFIG } from '../config/environment';

// Use relative path so Vite proxy handles routing correctly
const API_BASE = '/api';

const AUTH_STORAGE_KEY = 'fleet_auth';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'employee' | 'admin';
  isSuperAdmin?: boolean;
}

export function getStoredAuth(): { user: AuthUser; token: string } | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setStoredAuth(user: AuthUser, token: string) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ user, token }));
}

export function clearStoredAuth() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

function getAuthHeaders(): Record<string, string> {
  const auth = getStoredAuth();
  if (!auth?.token) return {};
  return { Authorization: `Bearer ${auth.token}` };
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = { 'Content-Type': 'application/json', ...getAuthHeaders(), ...options?.headers } as Record<string, string>;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const isAuthEndpoint = path.startsWith('/auth/');
    if (res.status === 401 && headers.Authorization && !isAuthEndpoint) {
      clearStoredAuth();
      window.location.reload();
    }
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function login(email: string, password: string): Promise<{ user: AuthUser; token: string }> {
  const data = await fetchApi<{ user: AuthUser; token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return data;
}

export type RegisterResult =
  | { user: AuthUser; token: string }
  | { adminRequestSubmitted: true; message: string };

export async function register(
  email: string,
  password: string,
  name: string,
  role: 'employee' | 'admin'
): Promise<RegisterResult> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name, role }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  if (res.status === 202) {
    return { adminRequestSubmitted: true, message: data.message || 'Admin request submitted.' };
  }
  return { user: data.user, token: data.token };
}

export interface AdminApprovalRequest {
  id: string;
  email: string;
  name: string;
  requestedAt: string;
}

export async function fetchAdminRequests(): Promise<AdminApprovalRequest[]> {
  return fetchApi<AdminApprovalRequest[]>('/admin-requests');
}

export async function approveAdminRequest(id: string): Promise<{ message: string }> {
  return fetchApi<{ message: string }>(`/admin-requests/${id}/approve`, { method: 'POST' });
}

export async function rejectAdminRequest(id: string): Promise<{ message: string }> {
  return fetchApi<{ message: string }>(`/admin-requests/${id}/reject`, { method: 'POST' });
}

export async function fetchAssets(): Promise<Asset[]> {
  return fetchApi<Asset[]>('/assets');
}

export async function fetchAssetById(id: string): Promise<Asset | null> {
  try {
    return await fetchApi<Asset>(`/assets/${id}`);
  } catch {
    return null;
  }
}

export async function updateAsset(
  id: string,
  updates: Partial<{
    name: string;
    type: string;
    status: string;
    location: string;
    lat: number;
    lng: number;
    engineHours: number;
    idleTime: number;
    fuelLevel: number;
    batteryVoltage: number;
    speed: number;
    inGeofence: boolean;
    lastUpdate: string;
    driver: string;
    efficiencyScore: number;
  }>
): Promise<Asset> {
  const data = await fetchApi<Asset>(`/assets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return data;
}

export async function fetchPurchaseOrders(): Promise<PurchaseOrder[]> {
  const data = await fetchApi<{ id: string; poNumber: string; client: string; description: string; amount: number; status: string; createdDate: string; deliveryDate: string; assignedAssets: string[] }[]>('/purchase-orders');
  return data.map((po) => ({
    id: po.id,
    poNumber: po.poNumber,
    client: po.client,
    description: po.description,
    amount: po.amount,
    status: po.status as PurchaseOrder['status'],
    createdDate: po.createdDate,
    deliveryDate: po.deliveryDate,
    assignedAssets: po.assignedAssets,
  }));
}

export async function createPurchaseOrder(po: {
  poNumber: string;
  client: string;
  description: string;
  amount: number;
  deliveryDate: string;
  assignedAssets?: string[];
}): Promise<PurchaseOrder> {
  const data = await fetchApi<{ id: string; poNumber: string; client: string; description: string; amount: number; status: string; createdDate: string; deliveryDate: string; assignedAssets: string[] }>('/purchase-orders', {
    method: 'POST',
    body: JSON.stringify(po),
  });
  return {
    id: data.id,
    poNumber: data.poNumber,
    client: data.client,
    description: data.description,
    amount: data.amount,
    status: data.status as PurchaseOrder['status'],
    createdDate: data.createdDate,
    deliveryDate: data.deliveryDate,
    assignedAssets: data.assignedAssets,
  };
}

export async function updatePurchaseOrder(id: string, updates: { status?: string; description?: string }): Promise<PurchaseOrder> {
  const data = await fetchApi<{ id: string; poNumber: string; client: string; description: string; amount: number; status: string; createdDate: string; deliveryDate: string; assignedAssets: string[] }>(`/purchase-orders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return {
    id: data.id,
    poNumber: data.poNumber,
    client: data.client,
    description: data.description,
    amount: data.amount,
    status: data.status as PurchaseOrder['status'],
    createdDate: data.createdDate,
    deliveryDate: data.deliveryDate,
    assignedAssets: data.assignedAssets,
  };
}

export async function fetchTransactions(): Promise<Transaction[]> {
  const data = await fetchApi<{ id: string; poNumber: string; type: string; description: string; amount: number; assetId: string; date: string; receipt?: string }[]>('/transactions');
  return data.map((t) => ({
    id: t.id,
    poNumber: t.poNumber,
    type: t.type as Transaction['type'],
    description: t.description,
    amount: t.amount,
    assetId: t.assetId,
    date: t.date,
    receipt: t.receipt,
  }));
}

export async function createTransaction(txn: {
  poNumber: string;
  type: string;
  description: string;
  amount: number;
  assetId: string;
  date?: string;
}): Promise<Transaction> {
  const data = await fetchApi<{ id: string; poNumber: string; type: string; description: string; amount: number; assetId: string; date: string }>('/transactions', {
    method: 'POST',
    body: JSON.stringify(txn),
  });
  return {
    id: data.id,
    poNumber: data.poNumber,
    type: data.type as Transaction['type'],
    description: data.description,
    amount: data.amount,
    assetId: data.assetId,
    date: data.date,
  };
}

// ─── Traccar GPS Tracking ──────────────────────────────────

export interface TraccarDevice {
  id: number;
  name: string;
  uniqueId: string;
  status: string;
  lastUpdate: string | null;
  positionId: number;
  category: string;
}

export interface TraccarPosition {
  id: number;
  deviceId: number;
  latitude: number;
  longitude: number;
  speed: number; // knots
  course: number;
  altitude: number;
  accuracy: number;
  fixTime: string;
  deviceTime: string;
  serverTime: string;
  attributes: Record<string, unknown>;
}

export async function fetchTraccarStatus(): Promise<{ connected: boolean; error?: string }> {
  return fetchApi('/traccar/status');
}

export async function fetchTraccarDevices(): Promise<TraccarDevice[]> {
  return fetchApi('/traccar/devices');
}

export async function fetchTraccarPositions(deviceId?: number): Promise<TraccarPosition[]> {
  const path = deviceId ? `/traccar/positions?deviceId=${deviceId}` : '/traccar/positions';
  return fetchApi(path);
}

export async function fetchTraccarPositionHistory(
  deviceId: number,
  from: string,
  to: string
): Promise<TraccarPosition[]> {
  return fetchApi(
    `/traccar/positions/history?deviceId=${deviceId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  );
}

export async function createTraccarDevice(device: {
  name: string;
  uniqueId: string;
  category?: string;
}): Promise<TraccarDevice> {
  return fetchApi('/traccar/devices', {
    method: 'POST',
    body: JSON.stringify(device),
  });
}

export async function deleteTraccarDevice(deviceId: number): Promise<{ message: string }> {
  return fetchApi(`/traccar/devices/${deviceId}`, { method: 'DELETE' });
}

export async function fetchTraccarWsInfo(): Promise<{ wsUrl: string; authHeader: string }> {
  return fetchApi('/traccar/ws-info');
}
