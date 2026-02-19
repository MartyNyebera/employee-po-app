import { useEffect, useState } from 'react';
import { fetchTraccarDevices, fetchTraccarPositions, type TraccarDevice, type TraccarPosition } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { MapPin, Gauge, Navigation, AlertCircle, Wifi, WifiOff } from 'lucide-react';

interface DeviceWithPosition extends TraccarDevice {
  position?: TraccarPosition;
}

export function SimpleMap() {
  console.log('[SimpleMap] Component loading');
  const [devices, setDevices] = useState<DeviceWithPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          GPS Tracking ({devices.length} devices)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        {/* Simple map placeholder */}
        <div className="bg-slate-100 rounded-lg h-64 mb-6 flex items-center justify-center border-2 border-dashed border-slate-300">
          <div className="text-center text-slate-500">
            <MapPin className="size-12 mx-auto mb-3 text-slate-300" />
            <div className="font-medium">Interactive Map</div>
            <div className="text-sm mt-1">
              Install react-leaflet to enable live map view
            </div>
            <div className="text-xs mt-2 bg-slate-200 px-2 py-1 rounded inline-block">
              npm install react-leaflet@4.2.1 @types/leaflet
            </div>
          </div>
        </div>

        {/* Device list */}
        <div className="space-y-3">
          <div className="text-sm font-medium text-slate-500 uppercase tracking-wider">
            Tracked Devices
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {devices.map(device => {
              const status = device.status || 'offline';
              const isOnline = status === 'online';
              
              return (
                <div
                  key={device.id}
                  className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`size-2 rounded-full ${
                        isOnline ? 'bg-green-500' : 'bg-gray-400'
                      }`} />
                      <div className="font-medium text-slate-900 truncate">
                        {device.name}
                      </div>
                    </div>
                    <Badge variant={isOnline ? 'default' : 'secondary'}>
                      {status}
                    </Badge>
                  </div>

                  {device.position ? (
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Speed:</span>
                        <span className="font-medium flex items-center gap-1">
                          <Gauge className="size-3" />
                          {((device.position.speed * 1.852)).toFixed(1)} km/h
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Course:</span>
                        <span className="font-medium flex items-center gap-1">
                          <Navigation className="size-3" />
                          {device.position.course}°
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Position:</span>
                        <span className="font-mono text-xs">
                          {device.position.latitude.toFixed(4)}, {device.position.longitude.toFixed(4)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-2 pt-2 border-t">
                        {new Date(device.position.fixTime).toLocaleString()}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500">
                      No position data available
                    </div>
                  )}

                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500">ID: {device.id}</span>
                    <span className="text-slate-500">IMEI: {device.uniqueId}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
