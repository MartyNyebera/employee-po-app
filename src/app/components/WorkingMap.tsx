import { useEffect, useState, useRef } from 'react';
import { fetchTraccarDevices, fetchTraccarPositions, type TraccarDevice, type TraccarPosition } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { MapPin, Gauge, Navigation, AlertCircle } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Leaflet with Webpack/Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface DeviceWithPosition extends TraccarDevice {
  position?: TraccarPosition;
}

export function WorkingMap() {
  console.log('[WorkingMap] Component loading');
  console.log('[WorkingMap] Leaflet available:', typeof L !== 'undefined');
  
  const [devices, setDevices] = useState<DeviceWithPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  // Fetch devices and positions on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const [devicesData, positionsData] = await Promise.all([
          fetchTraccarDevices(),
          fetchTraccarPositions(),
        ]);
        
        // Merge devices with their latest positions
        const merged = devicesData.map(device => {
          const position = positionsData.find(p => p.deviceId === device.id);
          return { ...device, position };
        });
        
        setDevices(merged);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load GPS data');
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
    
    // Refresh every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Initialize map when component mounts and when devices change
  useEffect(() => {
    if (!mapRef.current || loading) return;

    // Initialize map if not already done
    if (!mapInstanceRef.current) {
      console.log('[WorkingMap] Initializing map...');
      
      // Wait for next frame to ensure DOM is ready
      requestAnimationFrame(() => {
        if (!mapRef.current) return;
        
        try {
          mapInstanceRef.current = L.map(mapRef.current, {
            center: [12.8797, 121.7740],
            zoom: 6
          });
          
          // Add OpenStreetMap tiles
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          }).addTo(mapInstanceRef.current);
          
          console.log('[WorkingMap] Map initialized successfully!');
        } catch (error) {
          console.error('[WorkingMap] Map initialization failed:', error);
        }
      });
    }

    // Update markers when devices change
    if (mapInstanceRef.current) {
      // Clear existing markers
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];

      // Add markers for devices with positions
      const devicesWithPositions = devices.filter(d => d.position);
      
      if (devicesWithPositions.length > 0) {
        // Create custom icon for vehicles
        const createVehicleIcon = (type: string, status: string) => {
          const colors: Record<string, string> = {
            online: '#10b981',
            offline: '#6b7280',
            unknown: '#f59e0b',
          };
          const color = colors[status] || colors.offline;
          
          return L.divIcon({
            className: 'custom-marker',
            html: `
              <div style="
                background: ${color};
                width: 32px;
                height: 32px;
                border-radius: 50% 50% 50% 0;
                transform: rotate(-45deg);
                border: 3px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                display: flex;
                align-items: center;
                justify-content: center;
              ">
                <div style="transform: rotate(45deg); color: white; font-size: 16px; font-weight: bold;">
                  🚛
                </div>
              </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32],
          });
        };

        devicesWithPositions.forEach(device => {
          const pos = device.position!;
          const status = device.status || 'offline';
          
          const marker = L.marker([pos.latitude, pos.longitude], {
            icon: createVehicleIcon(device.category || 'default', status)
          }).addTo(mapInstanceRef.current!);
          
          // Add popup
          const speedKmh = (pos.speed * 1.852).toFixed(1);
          marker.bindPopup(`
            <div style="min-width: 200px;">
              <div style="font-weight: bold; margin-bottom: 8px;">${device.name}</div>
              <div style="font-size: 12px; color: #666;">
                <div>Status: <span style="color: ${status === 'online' ? '#10b981' : '#6b7280'}">${status}</span></div>
                <div>Speed: ${speedKmh} km/h</div>
                <div>Course: ${pos.course}°</div>
                <div>Lat: ${pos.latitude.toFixed(4)}</div>
                <div>Lng: ${pos.longitude.toFixed(4)}</div>
                <div style="margin-top: 8px; font-size: 10px; color: #999;">
                  ${new Date(pos.fixTime).toLocaleString()}
                </div>
              </div>
            </div>
          `);
          
          markersRef.current.push(marker);
        });

        // Fit map to show all markers
        if (markersRef.current.length > 0) {
          const group = new L.FeatureGroup(markersRef.current);
          mapInstanceRef.current.fitBounds(group.getBounds().pad(0.1));
        }
      }
    }

    return () => {
      // Cleanup map on unmount
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [devices, loading]);

  if (loading) {
    return (
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardContent className="p-6 flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />
            <span className="text-sm font-medium text-slate-500">Loading GPS data...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardContent className="p-6">
          <div className="flex items-start gap-3 text-red-600">
            <AlertCircle className="size-5 mt-0.5" />
            <div>
              <div className="font-semibold">GPS Connection Error</div>
              <div className="text-sm text-red-500 mt-1">{error}</div>
              <div className="text-xs text-slate-500 mt-2">
                Make sure Traccar server is running on http://localhost:8082
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (devices.length === 0) {
    return (
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardContent className="p-6 text-center text-slate-500">
          <MapPin className="size-12 mx-auto mb-3 text-slate-300" />
          <div className="font-medium">No GPS devices registered</div>
          <div className="text-sm mt-1">Add devices in Traccar to see them here</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
      <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
        <CardTitle className="flex items-center gap-2 text-slate-900 font-semibold">
          <MapPin className="size-5 text-slate-600" />
          Live GPS Tracking ({devices.length} devices)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-[500px] relative border-2 border-blue-500">
          <div ref={mapRef} className="w-full h-full" style={{ minHeight: '500px' }} />
        </div>
        
        {/* Device list below map */}
        <div className="border-t border-slate-100 p-4 bg-slate-50/50">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">
            Tracked Devices
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {devices.map(device => (
              <div
                key={device.id}
                className="flex items-center gap-2 p-2 bg-white rounded border border-slate-200 text-sm"
              >
                <div className={`size-2 rounded-full ${
                  device.status === 'online' ? 'bg-green-500' : 'bg-gray-400'
                }`} />
                <span className="font-medium text-slate-900 truncate flex-1">{device.name}</span>
                {device.position && (
                  <span className="text-xs text-slate-500">
                    {((device.position.speed * 1.852)).toFixed(0)} km/h
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
