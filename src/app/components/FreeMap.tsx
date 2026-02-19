import { useEffect, useState } from 'react';
import { fetchTraccarDevices, fetchTraccarPositions, type TraccarDevice, type TraccarPosition } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { MapPin, Gauge, Navigation, AlertCircle, ExternalLink } from 'lucide-react';

interface DeviceWithPosition extends TraccarDevice {
  position?: TraccarPosition;
}

export function FreeMap() {
  console.log('[FreeMap] Component loading');
  const [devices, setDevices] = useState<DeviceWithPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch devices and positions on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('[FreeMap] Loading GPS data...');
        setLoading(true);
        setError(null);
        
        const [devicesData, positionsData] = await Promise.all([
          fetchTraccarDevices(),
          fetchTraccarPositions(),
        ]);
        
        console.log('[FreeMap] Devices:', devicesData.length);
        console.log('[FreeMap] Positions:', positionsData.length);
        
        // Merge devices with their latest positions
        const merged = devicesData.map(device => {
          const position = positionsData.find(p => p.deviceId === device.id);
          return { ...device, position };
        });
        
        console.log('[FreeMap] Merged devices:', merged.length);
        setDevices(merged);
      } catch (err) {
        console.error('[FreeMap] Error loading GPS data:', err);
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

  // Generate OpenStreetMap URL with markers
  const generateMapUrl = () => {
    const devicesWithPositions = devices.filter(d => d.position);
    
    if (devicesWithPositions.length === 0) {
      // Default Philippines view
      return 'https://www.openstreetmap.org/#map=6/12.8797/121.7740';
    }

    // Create marker string for OpenStreetMap
    const markers = devicesWithPositions.map(device => {
      const pos = device.position!;
      const status = device.status || 'offline';
      const color = status === 'online' ? 'green' : 'red';
      return `${pos.latitude},${pos.longitude},${color}-${device.name.replace(/ /g, '%20')}`;
    }).join('/');

    // Calculate bounds
    const lats = devicesWithPositions.map(d => d.position!.latitude);
    const lngs = devicesWithPositions.map(d => d.position!.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    
    // Calculate appropriate zoom
    const latDiff = maxLat - minLat;
    const lngDiff = maxLng - minLng;
    const maxDiff = Math.max(latDiff, lngDiff);
    const zoom = Math.max(1, Math.min(15, Math.floor(10 - Math.log2(maxDiff))));

    return `https://www.openstreetmap.org/#map=${zoom}/${centerLat}/${centerLng}`;
  };

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
        {/* OpenStreetMap iframe */}
        <div className="h-[500px] relative">
          <iframe
            src={generateMapUrl()}
            className="w-full h-full border-0"
            title="GPS Tracking Map"
            style={{ minHeight: '500px' }}
          />
          <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-2">
            <a
              href={generateMapUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
            >
              <ExternalLink className="size-4" />
              Open in OpenStreetMap
            </a>
          </div>
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
          
          {/* Device details */}
          <div className="mt-4 pt-4 border-t border-slate-200">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">
              Device Locations
            </div>
            <div className="space-y-2">
              {devices.filter(d => d.position).map(device => (
                <div key={device.id} className="flex items-center justify-between p-2 bg-white rounded border border-slate-200">
                  <div className="flex items-center gap-3">
                    <div className={`size-2 rounded-full ${
                      device.status === 'online' ? 'bg-green-500' : 'bg-gray-400'
                    }`} />
                    <div>
                      <div className="font-medium text-sm text-slate-900">{device.name}</div>
                      <div className="text-xs text-slate-500">
                        {device.position!.latitude.toFixed(4)}, {device.position!.longitude.toFixed(4)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-medium text-slate-700">
                      {((device.position!.speed * 1.852)).toFixed(1)} km/h
                    </div>
                    <div className="text-xs text-slate-500">
                      {device.position!.course}°
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
