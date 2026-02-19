import { useEffect, useRef, useState } from 'react';
import { getStoredAuth } from '../api/client';

interface MobilePos {
  deviceId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
}

type DeviceStatus = 'Moving' | 'Idle' | 'Offline' | 'Waiting';

declare global {
  interface Window { maplibregl: any; }
}

const DEVICE_ID = 'phone-tracker-1';
const POLL_MS = 2000;
const OFFLINE_THRESHOLD_MS = 30000;
const MOVING_SPEED_KMH = 2;
const MOVING_DIST_M = 10;

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getStatus(pos: MobilePos | null, prevPos: MobilePos | null): DeviceStatus {
  if (!pos) return 'Waiting';
  const age = Date.now() - pos.timestamp;
  if (age > OFFLINE_THRESHOLD_MS) return 'Offline';
  if (pos.speed != null && pos.speed > MOVING_SPEED_KMH) return 'Moving';
  if (prevPos) {
    const dist = haversineMeters(prevPos.lat, prevPos.lng, pos.lat, pos.lng);
    if (dist > MOVING_DIST_M) return 'Moving';
  }
  return 'Idle';
}

const STATUS_COLORS: Record<DeviceStatus, string> = {
  Moving: '#22c55e',
  Idle: '#f59e0b',
  Offline: '#ef4444',
  Waiting: '#64748b',
};

function makeMarkerEl(heading: number | null, status: DeviceStatus) {
  const color = STATUS_COLORS[status];
  const rotation = heading != null ? `rotate(${heading}deg)` : 'none';
  const el = document.createElement('div');
  el.style.cssText = `width:36px;height:36px;display:flex;align-items:center;justify-content:center;`;
  el.innerHTML = `
    <div style="
      background:${color};
      width:32px;height:32px;border-radius:50%;
      border:3px solid white;
      box-shadow:0 2px 10px rgba(0,0,0,0.35);
      display:flex;align-items:center;justify-content:center;
      transform:${rotation};
      transition:transform 0.5s ease;
    ">
      <span style="font-size:16px;line-height:1;">${heading != null ? '▲' : '📱'}</span>
    </div>`;
  return el;
}

export function SuperSimpleMap() {
  const [pos, setPos] = useState<MobilePos | null>(null);
  const [prevPos, setPrevPos] = useState<MobilePos | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [follow, setFollow] = useState(true);
  const [deviceId, setDeviceId] = useState(DEVICE_ID);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const markerElRef = useRef<HTMLElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load MapLibre CSS + JS once
  useEffect(() => {
    if (window.maplibregl) { setMapReady(true); return; }
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css';
    document.head.appendChild(css);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js';
    script.onload = () => setMapReady(true);
    document.head.appendChild(script);
  }, []);

  // Init map
  useEffect(() => {
    if (!mapReady || !mapContainerRef.current || mapRef.current) return;
    mapRef.current = new window.maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [121.0, 14.6],
      zoom: 12,
    });
  }, [mapReady]);

  // Poll backend
  useEffect(() => {
    const auth = getStoredAuth();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth?.token) headers['Authorization'] = `Bearer ${auth.token}`;

    const poll = async () => {
      try {
        const res = await fetch(`/api/mobile/${encodeURIComponent(deviceId)}/latest`, { headers });
        if (res.status === 404) return;
        if (!res.ok) return;
        const data: MobilePos = await res.json();
        setPos(prev => { setPrevPos(prev); return data; });
      } catch { /* network error - ignore */ }
    };

    poll();
    pollRef.current = setInterval(poll, POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [deviceId]);

  // Update marker on map
  useEffect(() => {
    if (!pos || !mapRef.current || !window.maplibregl) return;
    const status = getStatus(pos, prevPos);

    if (!markerRef.current) {
      const el = makeMarkerEl(pos.heading, status);
      markerElRef.current = el;
      markerRef.current = new window.maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([pos.lng, pos.lat])
        .addTo(mapRef.current);
    } else {
      markerRef.current.setLngLat([pos.lng, pos.lat]);
      // Update marker color/rotation in place
      if (markerElRef.current) {
        const inner = markerElRef.current.querySelector('div') as HTMLElement;
        if (inner) {
          inner.style.background = STATUS_COLORS[status];
          inner.style.transform = pos.heading != null ? `rotate(${pos.heading}deg)` : 'none';
          const icon = inner.querySelector('span') as HTMLElement;
          if (icon) icon.textContent = pos.heading != null ? '▲' : '📱';
        }
      }
    }

    if (follow) {
      mapRef.current.easeTo({ center: [pos.lng, pos.lat], zoom: 15, duration: 800 });
    }
  }, [pos, follow]);

  const status = getStatus(pos, prevPos);
  const statusColor = STATUS_COLORS[status];

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: statusColor }} />
          <span className="font-semibold text-slate-900 dark:text-white text-sm">📡 Live GPS Map</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: statusColor + '22', color: statusColor }}>{status}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFollow(f => !f)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${follow ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600'}`}
          >
            {follow ? '📍 Following' : '📍 Follow'}
          </button>
        </div>
      </div>

      {/* Device ID selector */}
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">Device ID:</span>
        <input
          type="text"
          value={deviceId}
          onChange={e => setDeviceId(e.target.value.trim())}
          className="flex-1 text-xs px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="phone-tracker-1"
        />
      </div>

      {/* Map */}
      <div className="relative flex-1" style={{ minHeight: '420px' }}>
        <div ref={mapContainerRef} className="absolute inset-0" />

        {/* Overlay info card */}
        {pos && (
          <div className="absolute top-3 left-3 z-10 bg-white/95 dark:bg-slate-800/95 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-3 text-xs space-y-1 min-w-[160px]">
            <div className="font-semibold text-slate-900 dark:text-white mb-1">📱 {pos.deviceId}</div>
            <div className="text-slate-600 dark:text-slate-300">Lat: <span className="font-mono">{pos.lat.toFixed(5)}</span></div>
            <div className="text-slate-600 dark:text-slate-300">Lng: <span className="font-mono">{pos.lng.toFixed(5)}</span></div>
            <div className="text-slate-600 dark:text-slate-300">Speed: <span className="font-mono">{pos.speed != null ? `${pos.speed.toFixed(1)} km/h` : '—'}</span></div>
            <div className="text-slate-600 dark:text-slate-300">Heading: <span className="font-mono">{pos.heading != null ? `${pos.heading.toFixed(0)}°` : '—'}</span></div>
            <div className="text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-600">
              {new Date(pos.timestamp).toLocaleTimeString()}
            </div>
          </div>
        )}

        {/* No data overlay */}
        {!pos && mapReady && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="bg-white/90 dark:bg-slate-800/90 rounded-xl px-6 py-4 text-center shadow-lg border border-slate-200 dark:border-slate-700">
              <div className="text-2xl mb-2">📡</div>
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Waiting for device</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Open <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">/tracker</code> on your phone</div>
            </div>
          </div>
        )}
      </div>

      {/* Footer status bar */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400">
        <span>Polling every {POLL_MS / 1000}s</span>
        <span>{pos ? `Last update: ${new Date(pos.timestamp).toLocaleTimeString()}` : 'No data yet'}</span>
      </div>
    </div>
  );
}
