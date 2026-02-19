import { useEffect, useState } from 'react';
import { fetchTraccarDevices, fetchTraccarPositions, type TraccarDevice, type TraccarPosition } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { MapPin, Gauge, Navigation, AlertCircle, ExternalLink } from 'lucide-react';

interface DeviceWithPosition extends TraccarDevice {
  position?: TraccarPosition;
}

export function WorkingLiveMap() {
  console.log('[WorkingLiveMap] Component loading');
  const [devices, setDevices] = useState<DeviceWithPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch devices and positions on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('[WorkingLiveMap] Loading GPS data...');
        setLoading(true);
        setError(null);
        
        const [devicesData, positionsData] = await Promise.all([
          fetchTraccarDevices(),
          fetchTraccarPositions(),
        ]);
        
        console.log('[WorkingLiveMap] Devices:', devicesData.length);
        console.log('[WorkingLiveMap] Positions:', positionsData.length);
        
        // Merge devices with their latest positions
        const merged = devicesData.map(device => {
          const position = positionsData.find(p => p.deviceId === device.id);
          return { ...device, position };
        });
        
        console.log('[WorkingLiveMap] Merged devices:', merged.length);
        setDevices(merged);
      } catch (err) {
        console.error('[WorkingLiveMap] Error loading GPS data:', err);
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

  // Generate OpenStreetMap URL
  const getMapUrl = () => {
    const devicesWithPositions = devices.filter(d => d.position);
    
    if (devicesWithPositions.length === 0) {
      // Default Philippines view
      return 'https://www.openstreetmap.org/?mlat=12.8797&mlon=121.7740&zoom=6';
    }

    // Get first device position for center
    const firstDevice = devicesWithPositions[0];
    const pos = firstDevice.position!;
    
    return `https://www.openstreetmap.org/?mlat=${pos.latitude}&mlon=${pos.longitude}&zoom=15`;
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
        {/* Map Preview */}
        <div className="h-[400px] relative bg-gradient-to-br from-blue-50 to-green-50 border-2 border-green-500">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <MapPin className="size-16 mx-auto mb-4 text-green-500" />
              <div className="text-lg font-semibold text-green-900">Live Map Ready!</div>
              <div className="text-sm text-green-700 mt-2">GPS tracking system is working</div>
              
              {/* Show device positions */}
              {devices.filter(d => d.position).length > 0 && (
                <div className="mt-4 p-3 bg-white rounded-lg border border-green-200">
                  <div className="text-sm font-medium text-green-800 mb-2">
                    🚛 Active Vehicles: {devices.filter(d => d.position).length}
                  </div>
                  <div className="space-y-1">
                    {devices.filter(d => d.position).slice(0, 3).map(device => (
                      <div key={device.id} className="text-xs text-green-700">
                        📍 {device.name}: {device.position!.latitude.toFixed(4)}, {device.position!.longitude.toFixed(4)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <a
                href={getMapUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                <ExternalLink className="size-4" />
                Open Live Map
              </a>
            </div>
          </div>
        </div>
        
        {/* Device List */}
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
          
          {/* Device Details */}
          {devices.filter(d => d.position).length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">
                Live Positions
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
          )}
        </div>
      </CardContent>
    </Card>
  );
}
