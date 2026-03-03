import { useEffect, useState, useRef } from 'react';
import * as ReactLeaflet from 'react-leaflet';
const { MapContainer, TileLayer, Marker, Popup, useMap } = ReactLeaflet;
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { MapPin, Navigation, RefreshCw, Gauge, AlertCircle } from 'lucide-react';
import { fetchTraccarPositions, type TraccarDevice, type TraccarPosition } from '../api/client';

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

interface SingleDeviceTrackerProps {
  device: DeviceWithPosition;
  onBack?: () => void;
}

// Custom marker icon for vehicle
const createVehicleIcon = (status: string) => {
  const colors: Record<string, string> = {
    online: '#10b981',
    idle: '#f59e0b',
    offline: '#6b7280',
  };
  const color = colors[status] || colors.offline;
  
  return L.divIcon({
    className: 'custom-vehicle-marker',
    html: `
      <div style="
        background: ${color};
        width: 40px;
        height: 40px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="transform: rotate(45deg); color: white; font-size: 18px; font-weight: bold;">
          🚚
        </div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40],
  });
};

// Component to center map on device
function MapCenter({ position }: { position: [number, number] }) {
  const map = useMap();
  
  useEffect(() => {
    if (position) {
      map.setView(position, 16, { animate: true });
    }
  }, [position, map]);
  
  return null;
}

export function SingleDeviceTracker({ device, onBack }: SingleDeviceTrackerProps) {
  const [currentPosition, setCurrentPosition] = useState<TraccarPosition | null>(device.position || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch latest position for this device
  const fetchLatestPosition = async () => {
    if (!device.id) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const positions = await fetchTraccarPositions(device.id);
      if (positions.length > 0) {
        setCurrentPosition(positions[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch position');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLatestPosition();
    
    // Refresh every 10 seconds for real-time tracking
    const interval = setInterval(fetchLatestPosition, 10000);
    return () => clearInterval(interval);
  }, [device.id]);

  if (!currentPosition) {
    return (
      <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 text-amber-600">
            <AlertCircle className="size-5" />
            <div>
              <div className="font-semibold">No GPS Data</div>
              <div className="text-sm text-amber-500">No recent position data available for {device.name}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const position: [number, number] = [currentPosition.latitude, currentPosition.longitude];
  const speedKmh = (currentPosition.speed * 1.852).toFixed(1); // knots to km/h
  const status = device.status || 'offline';
  const isOnline = currentPosition && 
    (Date.now() - new Date(currentPosition.fixTime).getTime()) < 60000; // 1 minute

  return (
    <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5 overflow-hidden">
      {/* Header */}
      <CardHeader className="border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBack && (
              <Button variant="ghost" size="sm" onClick={onBack} className="p-1">
                ← Back
              </Button>
            )}
            <div>
              <CardTitle className="text-slate-900 font-bold text-lg flex items-center gap-2">
                <MapPin className="size-5 text-blue-600" />
                {device.name}
              </CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={isOnline ? 'default' : 'secondary'}>
                  {isOnline ? 'Online' : 'Offline'}
                </Badge>
                <span className="text-sm text-slate-500">ID: {device.id}</span>
              </div>
            </div>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={fetchLatestPosition}
            disabled={loading}
            className="border-slate-200 hover:bg-slate-50"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      
      {/* Map */}
      <div className="h-[500px] relative">
        <MapContainer
          center={position}
          zoom={16}
          style={{ height: '100%', width: '100%' }}
          className="z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          <MapCenter position={position} />
          
          <Marker
            position={position}
            icon={createVehicleIcon(status)}
          >
            <Popup>
              <div className="min-w-[250px]">
                <div className="font-semibold text-slate-900 mb-3">{device.name}</div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Status:</span>
                    <Badge variant={isOnline ? 'default' : 'secondary'}>
                      {isOnline ? 'Online' : 'Offline'}
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
                    <span className="font-medium">{currentPosition.course}°</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Altitude:</span>
                    <span className="font-medium">{currentPosition.altitude.toFixed(0)}m</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Last Update:</span>
                    <span className="font-medium">
                      {new Date(currentPosition.fixTime).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        </MapContainer>
        
        {/* Status Overlay */}
        <div className="absolute top-4 left-4 z-10 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-4 border border-slate-200/60">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            <span className="font-semibold text-slate-900">
              {isOnline ? '📍 Live Tracking' : '📍 Last Known Position'}
            </span>
          </div>
          
          <div className="space-y-1 text-sm text-slate-600">
            <div className="flex justify-between gap-4">
              <span>Speed:</span>
              <span className="font-mono font-medium">{speedKmh} km/h</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Lat:</span>
              <span className="font-mono">{currentPosition.latitude.toFixed(6)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Lng:</span>
              <span className="font-mono">{currentPosition.longitude.toFixed(6)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Updated:</span>
              <span className="font-mono">{new Date(currentPosition.fixTime).toLocaleTimeString()}</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <div className="px-6 py-3 border-t border-slate-200 bg-slate-50/50">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>Device: {device.name}</span>
            <span>•</span>
            <span>Category: {device.category || 'default'}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            <span>{isOnline ? 'Real-time Tracking' : 'Last Position'}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
