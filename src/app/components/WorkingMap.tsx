import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { MapPin, Wifi, WifiOff } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface GPSDevice {
  id: number;
  name: string;
  deviceId: string;
  lat: number;
  lng: number;
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
  timestamp: number;
  lastSeen: number;
  vehicle_id?: string;
  vehicle_name?: string;
  plate_number?: string;
  driver_name?: string;
  driver_contact?: string;
  delivery_id?: string;
  so_number?: string;
  customer_name?: string;
  customer_address?: string;
  delivery_status?: string;
}

export function WorkingMap() {
  const [devices, setDevices] = useState<GPSDevice[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [connectionOk, setConnectionOk] = useState(true);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const mapReadyRef = useRef(false);

  // Initialize map once on mount
  useEffect(() => {
    if (!mapRef.current || mapReadyRef.current) return;

    try {
      const map = L.map(mapRef.current, {
        center: [14.0, 121.0], // Philippines center
        zoom: 7,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
      mapReadyRef.current = true;
    } catch (e) {
      console.error('[WorkingMap] init error:', e);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        mapReadyRef.current = false;
      }
    };
  }, []);

  // Update markers whenever devices change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const activeIds = new Set(devices.map(d => d.deviceId));

    // Remove markers for devices no longer present
    markersRef.current.forEach((marker, id) => {
      if (!activeIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    devices.forEach(device => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          background:${device.vehicle_name ? '#dc2626' : '#2563eb'};width:36px;height:36px;border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);border:3px solid white;
          box-shadow:0 2px 8px rgba(0,0,0,0.35);
          display:flex;align-items:center;justify-content:center;">
          <span style="transform:rotate(45deg);font-size:18px;">${device.vehicle_name ? '🚗' : '📱'}</span>
        </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -38],
      });

      const popupHtml = `
        <div style="min-width:220px;font-family:sans-serif;">
          <div style="font-weight:700;font-size:13px;margin-bottom:6px;color:#1e293b;">
            ${device.vehicle_name ? '� ' + device.vehicle_name : '� ' + device.name}
            ${device.plate_number ? '<span style="font-size:11px;color:#64748b;"> (' + device.plate_number + ')</span>' : ''}
          </div>
          ${device.driver_name ? `
            <div style="font-size:11px;color:#475569;margin-bottom:4px;">
              <div>👤 <b>Driver:</b> ${device.driver_name}</div>
              ${device.driver_contact ? '<div>📞 <b>Contact:</b> ' + device.driver_contact + '</div>' : ''}
            </div>
          ` : ''}
          ${device.delivery_id ? `
            <div style="background:#f8fafc;border-left:3px solid #3b82f6;padding:6px;margin:6px 0;border-radius:4px;">
              <div style="font-weight:600;font-size:11px;color:#1e40af;margin-bottom:3px;">📦 Active Delivery</div>
              <div style="font-size:10px;color:#475569;line-height:1.4;">
                <div><b>SO:</b> ${device.so_number || '—'}</div>
                <div><b>Customer:</b> ${device.customer_name || '—'}</div>
                <div><b>Status:</b> <span style="color:#3b82f6;font-weight:500;">${device.delivery_status || '—'}</span></div>
              </div>
            </div>
          ` : ''}
          <div style="font-size:11px;color:#475569;line-height:1.7;">
            <div>🟢 <b>Status:</b> Online</div>
            <div>📍 <b>Lat:</b> ${device.lat.toFixed(6)}</div>
            <div>📍 <b>Lng:</b> ${device.lng.toFixed(6)}</div>
            <div>🚀 <b>Speed:</b> ${device.speed != null ? device.speed.toFixed(1) + ' km/h' : '—'}</div>
            <div>🧭 <b>Heading:</b> ${device.heading != null ? device.heading.toFixed(0) + '°' : '—'}</div>
            <div>🎯 <b>Accuracy:</b> ${device.accuracy != null ? '±' + device.accuracy.toFixed(0) + 'm' : '—'}</div>
            <div style="margin-top:4px;color:#94a3b8;font-size:10px;">
              Updated: ${new Date(device.lastSeen).toLocaleTimeString()}
            </div>
          </div>
        </div>`;

      if (markersRef.current.has(device.deviceId)) {
        const existing = markersRef.current.get(device.deviceId)!;
        existing.setLatLng([device.lat, device.lng]);
        existing.setIcon(icon);
        existing.setPopupContent(popupHtml);
      } else {
        const marker = L.marker([device.lat, device.lng], { icon })
          .bindPopup(popupHtml)
          .addTo(map);
        markersRef.current.set(device.deviceId, marker);
      }
    });

    // Fit bounds to show all devices
    if (devices.length > 0) {
      const group = L.featureGroup(Array.from(markersRef.current.values()));
      map.fitBounds(group.getBounds().pad(0.2));
    }
  }, [devices]);

  // Poll every 5 seconds
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const res = await fetch('/api/phone-location/devices');
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        setConnectionOk(true);
        setLastUpdated(new Date().toLocaleTimeString());

        if (data.devices && data.devices.length > 0) {
          const mapped: GPSDevice[] = data.devices.map((d: any, i: number) => ({
            id: i + 1,
            name: d.deviceId,
            deviceId: d.deviceId,
            lat: d.lat,
            lng: d.lng,
            speed: d.speed ?? null,
            heading: d.heading ?? null,
            accuracy: d.accuracy ?? null,
            timestamp: d.timestamp,
            lastSeen: d.lastSeen || d.timestamp,
            vehicle_id: d.vehicle_id,
            vehicle_name: d.vehicle_name,
            plate_number: d.plate_number,
            driver_name: d.driver_name,
            driver_contact: d.driver_contact,
            delivery_id: d.delivery_id,
            so_number: d.so_number,
            customer_name: d.customer_name,
            customer_address: d.customer_address,
            delivery_status: d.delivery_status,
          }));
          setDevices(mapped);
        } else {
          setDevices([]);
        }
      } catch {
        setConnectionOk(false);
      }
    };

    fetchDevices();
    const interval = setInterval(fetchDevices, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 text-white text-xs">
        <div className="flex items-center gap-2">
          <MapPin className="size-3.5 text-blue-400" />
          <span className="font-semibold">Live GPS Tracking</span>
          {devices.length > 0 && (
            <span className="bg-green-500 text-white px-2 py-0.5 rounded-full text-xs font-bold">
              {devices.length} device{devices.length > 1 ? 's' : ''} online
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-slate-400">
          {connectionOk
            ? <Wifi className="size-3.5 text-green-400" />
            : <WifiOff className="size-3.5 text-red-400" />}
          <span>{connectionOk ? `Updated ${lastUpdated}` : 'Connection error — retrying…'}</span>
        </div>
      </div>

      {/* Map always rendered */}
      <div className="relative flex-1" style={{ minHeight: '500px' }}>
        <div ref={mapRef} className="w-full h-full absolute inset-0" />

        {/* Overlay when no devices yet */}
        {devices.length === 0 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow text-sm text-slate-600 flex items-center gap-2 pointer-events-none">
            <span className="animate-pulse text-blue-500">●</span>
            Waiting for GPS signal… Start tracking on your phone
          </div>
        )}
      </div>

      {/* Device list */}
      {devices.length > 0 && (
        <div className="border-t border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Active Devices</div>
          <div className="flex flex-wrap gap-2">
            {devices.map(device => (
              <div key={device.deviceId}
                className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs shadow-sm cursor-pointer hover:border-blue-400"
                onClick={() => {
                  const marker = markersRef.current.get(device.deviceId);
                  if (marker && mapInstanceRef.current) {
                    mapInstanceRef.current.setView([device.lat, device.lng], 15);
                    marker.openPopup();
                  }
                }}
              >
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="font-medium text-slate-800">{device.name}</span>
                {device.speed != null && (
                  <span className="text-slate-500">{device.speed.toFixed(0)} km/h</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
