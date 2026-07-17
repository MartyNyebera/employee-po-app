import type { Asset, PurchaseOrder, Transaction } from '../data/mockData';
import { CONFIG } from '../config/environment';

// Use relative path so Vite proxy handles routing correctly
const API_BASE = '/api';

const AUTH_STORAGE_KEY = 'fleet_auth';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'employee' | 'admin' | 'bookkeeper' | 'purchasing' | 'office_admin';
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

export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = { 'Content-Type': 'application/json', ...getAuthHeaders(), ...options?.headers } as Record<string, string>;
  // Only retry idempotent requests. Retrying a POST/PUT/PATCH/DELETE that already
  // committed server-side (but errored afterward) creates duplicate records.
  const method = (options?.method || 'GET').toUpperCase();
  const isIdempotent = method === 'GET' || method === 'HEAD';

  const fetchWithRetry = async (retries = 3, delay = 1000): Promise<Response> => {
    try {
      const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

      // Handle auth errors immediately (no retry)
      if (res.status === 401) {
        const isAuthEndpoint = path.startsWith('/auth/');
        if (headers.Authorization && !isAuthEndpoint) {
          clearStoredAuth();
          window.location.reload();
        }
        return res;
      }

      // Check if status is retryable (idempotent methods only)
      const shouldRetry = isIdempotent && [408, 429, 500, 502, 503, 504].includes(res.status);

      if (!res.ok && shouldRetry && retries > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchWithRetry(retries - 1, delay * 2);
      }

      return res;
    } catch (error) {
      // Network errors - retry idempotent requests only
      if (isIdempotent && retries > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchWithRetry(retries - 1, delay * 2);
      }
      throw error;
    }
  };
  
  const res = await fetchWithRetry();
  
  // Handle non-retryable errors
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`API request failed for ${path}: ${err.error || `HTTP ${res.status}`}`);
  }
  
  // Handle empty responses (like DELETE operations)
  const text = await res.text();
  if (!text) {
    return {} as T;
  }
  
  return JSON.parse(text);
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

export async function fetchPurchaseOrders(): Promise<(PurchaseOrder & { orderType?: string })[]> {
  // No cache-busting query param needed — the API sends Cache-Control: no-store.
  const data = await fetchApi<{ id: string; poNumber: string; client: string; description: string; amount: number; status: string; createdDate: string; deliveryDate: string; assignedAssets: string[]; orderType?: string }[]>(`/purchase-orders`);
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
    orderType: po.orderType,
  }));
}

export async function createPurchaseOrder(po: {
  poNumber: string;
  poDate: string;
  deliveryDate: string;
  poType: 'domestic' | 'foreign';
  paymentTerms: string;
  termsAndConditions: string;
  preparedBy: string;
  reviewedBy: string;
  customerName: string;
  customerAddress: string;
  customerContact: string;
  lineItems: Array<{
    id: string;
    no: number;
    account: string;
    vendor: string;
    quantity: number;
    unit: string;
    description: string;
    unitPrice: number;
    amount: number;
  }>;
  subTotal: number;
  otherCharges: number;
  vatAmount: number;
  totalAmount: number;
  createdDate?: string;
  orderType?: string;
}): Promise<PurchaseOrder> {
  const data = await fetchApi<{ id: string; poNumber: string; client: string; description: string; amount: number; status: string; createdDate: string; deliveryDate: string; assignedAssets: string[] }>('/purchase-orders', {
    method: 'POST',
    body: JSON.stringify({
      ...po,
      client: po.customerName,
      description: po.lineItems.map(item => item.description).join('; '),
      amount: po.totalAmount,
      assignedAssets: [],
      orderType: po.orderType, // Send orderType as-is (undefined for PO, 'sales' for SO)
    }),
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

export async function updatePurchaseOrder(id: string, updates: { status?: string; description?: string; client?: string; amount?: number; deliveryDate?: string; docDate?: string | null; preparedBy?: string | null; reviewedBy?: string | null; supplierAddress?: string | null; supplierContact?: string | null; paymentTerms?: string | null; termsAndConditions?: string | null }): Promise<PurchaseOrder> {
  const data = await fetchApi<{ id: string; poNumber: string; client: string; description: string; amount: number; status: string; createdDate: string; deliveryDate: string; assignedAssets: string[]; docDate?: string | null; preparedBy?: string | null; reviewedBy?: string | null; supplierAddress?: string | null; supplierContact?: string | null; paymentTerms?: string | null; termsAndConditions?: string | null }>(`/purchase-orders/${id}`, {
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
    // editable PDF header fields — pass through so optimistic UI merge + print see new values
    docDate: data.docDate,
    preparedBy: data.preparedBy,
    reviewedBy: data.reviewedBy,
    supplierAddress: data.supplierAddress,
    supplierContact: data.supplierContact,
    paymentTerms: data.paymentTerms,
    termsAndConditions: data.termsAndConditions,
  } as PurchaseOrder;
}

export async function deletePurchaseOrder(id: string): Promise<void> {
  await fetchApi(`/purchase-orders/${id}`, {
    method: 'DELETE',
  });
}

export async function deleteSalesOrder(id: string): Promise<void> {
  await fetchApi(`/sales-orders/${id}`, {
    method: 'DELETE',
  });
}

export async function fetchSalesOrders(): Promise<any[]> {
  // No cache-busting query param needed — the API sends Cache-Control: no-store.
  return fetchApi(`/sales-orders`);
}

export async function createSalesOrder(data: any): Promise<any> {
  return fetchApi('/sales-orders', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateSalesOrder(id: string, data: any): Promise<any> {
  return fetchApi(`/sales-orders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// Miscellaneous Expenses API
export async function fetchMiscellaneousExpenses(): Promise<any[]> {
  return fetchApi('/miscellaneous-expenses');
}

export async function createMiscellaneousExpense(data: any): Promise<any> {
  return fetchApi('/miscellaneous-expenses', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateMiscellaneousExpense(id: string, data: any): Promise<any> {
  return fetchApi(`/miscellaneous-expenses/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteMiscellaneousExpense(id: string): Promise<void> {
  return fetchApi(`/miscellaneous-expenses/${id}`, {
    method: 'DELETE',
  });
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
