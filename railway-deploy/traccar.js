/**
 * Traccar GPS server API client.
 * Wraps the Traccar REST API to fetch devices, positions, and geofences.
 * Also provides a WebSocket relay for real-time position updates.
 *
 * Traccar API docs: https://www.traccar.org/api-reference/
 */
import dotenv from 'dotenv';
dotenv.config();

const TRACCAR_URL = (process.env.TRACCAR_URL || 'http://localhost:8082').replace(/\/+$/, '');
const TRACCAR_USER = process.env.TRACCAR_USER || 'admin';
const TRACCAR_PASS = process.env.TRACCAR_PASS || 'admin';

const authHeader = 'Basic ' + Buffer.from(`${TRACCAR_USER}:${TRACCAR_PASS}`).toString('base64');

// Session cookie storage for Traccar
let traccarSession = null;

/**
 * Login to Traccar web interface to get session cookie
 */
async function loginToTraccar() {
  try {
    const loginUrl = `${TRACCAR_URL}/api/session`;
    const res = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `email=${encodeURIComponent(TRACCAR_USER)}&password=${encodeURIComponent(TRACCAR_PASS)}`,
    });
    
    if (res.ok) {
      const cookies = res.headers.get('set-cookie');
      if (cookies) {
        traccarSession = cookies.split(';')[0];
        return true;
      }
    }
    return false;
  } catch (err) {
    console.error('[Traccar] Login failed:', err.message);
    return false;
  }
}

/**
 * Generic Traccar API request helper.
 */
async function traccarFetch(path, options = {}) {
  const url = `${TRACCAR_URL}/api${path}`;
  
  // Try Basic Auth first
  let res = await fetch(url, {
    ...options,
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  
  // If Basic Auth fails, try session-based auth
  if (!res.ok && res.status === 401) {
    if (!traccarSession) {
      const loggedIn = await loginToTraccar();
      if (!loggedIn) {
        const text = await res.text().catch(() => '');
        throw new Error(`Traccar API ${res.status}: ${text || res.statusText}`);
      }
    }
    
    // Retry with session cookie
    res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Cookie': traccarSession,
        ...options.headers,
      },
    });
  }
  
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[Traccar] API Error Response:', text.substring(0, 200));
    throw new Error(`Traccar API ${res.status}: ${text || res.statusText}`);
  }
  
  const text = await res.text();
  console.log('[Traccar] Raw response:', text.substring(0, 200));
  
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error('[Traccar] JSON Parse Error:', text.substring(0, 500));
    throw new Error(`Traccar API returned invalid JSON: ${text.substring(0, 100)}`);
  }
}

// ─── Devices ───────────────────────────────────────────────

/** Get all devices registered in Traccar */
export async function getDevices() {
  return traccarFetch('/devices');
}

/** Get a single device by Traccar device ID */
export async function getDevice(deviceId) {
  return traccarFetch(`/devices?id=${deviceId}`).then((arr) => arr[0] || null);
}

/** Create a new device in Traccar */
export async function createDevice({ name, uniqueId, category }) {
  return traccarFetch('/devices', {
    method: 'POST',
    body: JSON.stringify({
      name,
      uniqueId, // IMEI of the ST-906
      category: category || 'default',
    }),
  });
}

/** Update a device in Traccar */
export async function updateDevice(deviceId, updates) {
  const device = await getDevice(deviceId);
  if (!device) throw new Error('Device not found in Traccar');
  return traccarFetch(`/devices/${deviceId}`, {
    method: 'PUT',
    body: JSON.stringify({ ...device, ...updates }),
  });
}

/** Delete a device from Traccar */
export async function deleteDevice(deviceId) {
  const url = `${TRACCAR_URL}/api/devices/${deviceId}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: authHeader },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Traccar API ${res.status}: ${text || res.statusText}`);
  }
  return true;
}

// ─── Positions ─────────────────────────────────────────────

/** Get latest positions for all devices (or a specific device) */
export async function getPositions(deviceId) {
  const path = deviceId ? `/positions?deviceId=${deviceId}` : '/positions';
  return traccarFetch(path);
}

/** Get position history for a device within a time range */
export async function getPositionHistory(deviceId, from, to) {
  const fromISO = new Date(from).toISOString();
  const toISO = new Date(to).toISOString();
  return traccarFetch(
    `/positions?deviceId=${deviceId}&from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`
  );
}

// ─── Geofences ─────────────────────────────────────────────

/** Get all geofences */
export async function getGeofences() {
  return traccarFetch('/geofences');
}

// ─── Server info ───────────────────────────────────────────

/** Check if Traccar server is reachable */
export async function checkConnection() {
  try {
    await traccarFetch('/server');
    return { connected: true };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

/** Get Traccar server info */
export async function getServerInfo() {
  return traccarFetch('/server');
}

// ─── WebSocket URL for real-time positions ─────────────────

/** Build the Traccar WebSocket URL for the frontend to connect to (via our proxy) */
export function getTraccarWsUrl() {
  const wsBase = TRACCAR_URL.replace(/^http/, 'ws');
  return `${wsBase}/api/socket`;
}

export { authHeader, TRACCAR_URL };
