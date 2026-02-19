import { useEffect, useState, useRef } from 'react';
import * as ReactLeaflet from 'react-leaflet';
const { MapContainer, TileLayer, Marker, Popup, useMap } = ReactLeaflet;
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchTraccarDevices, fetchTraccarPositions, type TraccarDevice, type TraccarPosition } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { MapPin, Gauge, Navigation, AlertCircle } from 'lucide-react';

// Fix for default marker icons in Leaflet with Webpack/Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom marker icons for different vehicle types
const createCustomIcon = (type: string, status: string) => {
  const colors: Record<string, string> = {
    active: '#10b981',
    idle: '#f59e0b',
    offline: '#6b7280',
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
          ${type === 'truck' ? '🚚' : type === 'backhoe' ? '🚜' : '🏗️'}
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
};

interface DeviceWithPosition extends TraccarDevice {
  position?: TraccarPosition;
}

// Component to auto-fit map bounds to markers
function MapBounds({ devices }: { devices: DeviceWithPosition[] }) {
  const map = useMap();
  
  useEffect(() => {
    if (devices.length === 0) return;
    
    const positions = devices
      .filter(d => d.position)
      .map(d => [d.position!.latitude, d.position!.longitude] as [number, number]);
    
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [devices, map]);
  
  return null;
}

export function LiveMap() {
  const [devices, setDevices] = useState<DeviceWithPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

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

  // WebSocket for real-time updates (optional - requires Traccar WebSocket proxy)
  // Uncomment this if you set up WebSocket relay in your backend
  /*
  useEffect(() => {
    const connectWebSocket = async () => {
      try {
        const { wsUrl, authHeader } = await fetchTraccarWsInfo();
        const ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
          console.log('[LiveMap] WebSocket connected');
        };
        
        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.positions) {
            setDevices(prev => {
              const updated = [...prev];
              data.positions.forEach((pos: TraccarPosition) => {
                const idx = updated.findIndex(d => d.id === pos.deviceId);
                if (idx !== -1) {
                  updated[idx] = { ...updated[idx], position: pos };
                }
              });
              return updated;
            });
          }
        };
        
        ws.onerror = (err) => {
          console.error('[LiveMap] WebSocket error:', err);
        };
        
        ws.onclose = () => {
          console.log('[LiveMap] WebSocket closed');
        };
        
        wsRef.current = ws;
      } catch (err) {
        console.error('[LiveMap] Failed to connect WebSocket:', err);
      }
    };
    
    connectWebSocket();
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);
  */

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

  const devicesWithPositions = devices.filter(d => d.position);
  const defaultCenter: [number, number] = devicesWithPositions.length > 0
    ? [devicesWithPositions[0].position!.latitude, devicesWithPositions[0].position!.longitude]
    : [14.5995, 120.9842]; // Manila default

  return (
    <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
      <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
        <CardTitle className="flex items-center gap-2 text-slate-900 font-semibold">
          <MapPin className="size-5 text-slate-600" />
          Live GPS Tracking ({devices.length} devices)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-[500px] relative">
          <MapContainer
            center={defaultCenter}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
            className="z-0"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            
            <MapBounds devices={devicesWithPositions} />
            
            {devicesWithPositions.map(device => {
              const pos = device.position!;
              const speedKmh = (pos.speed * 1.852).toFixed(1); // knots to km/h
              const status = device.status || 'offline';
              
              return (
                <Marker
                  key={device.id}
                  position={[pos.latitude, pos.longitude]}
                  icon={createCustomIcon(device.category || 'default', status)}
                >
                  <Popup>
                    <div className="min-w-[200px]">
                      <div className="font-semibold text-slate-900 mb-2">{device.name}</div>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Status:</span>
                          <Badge variant={status === 'online' ? 'default' : 'secondary'}>
                            {status}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Speed:</span>
                          <span className="font-medium flex items-center gap-1">
                            <Gauge className="size-3" />
                            {speedKmh} km/h
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Course:</span>
                          <span className="font-medium flex items-center gap-1">
                            <Navigation className="size-3" />
                            {pos.course}°
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Altitude:</span>
                          <span className="font-medium">{pos.altitude.toFixed(0)}m</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-2 pt-2 border-t">
                          {new Date(pos.fixTime).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
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
