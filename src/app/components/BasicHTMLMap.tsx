import { useEffect, useState } from 'react';
import { fetchTraccarDevices, fetchTraccarPositions, type TraccarDevice, type TraccarPosition } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { MapPin, AlertCircle } from 'lucide-react';

interface DeviceWithPosition extends TraccarDevice {
  position?: TraccarPosition;
}

export function BasicHTMLMap() {
  const [devices, setDevices] = useState<DeviceWithPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const [devicesData, positionsData] = await Promise.all([
          fetchTraccarDevices(),
          fetchTraccarPositions(),
        ]);
        
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
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
      <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
        <CardTitle className="flex items-center gap-2 text-slate-900 font-semibold">
          <MapPin className="size-5 text-slate-600" />
          Live GPS Tracking ({devices.length} devices)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {/* Simple HTML Map */}
        <div 
          className="h-[500px] relative bg-gradient-to-br from-blue-100 to-green-100"
          style={{
            backgroundImage: 'url(https://picsum.photos/seed/philippines-map/1200/500)',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          <div className="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center">
            <div className="bg-white rounded-lg p-6 shadow-xl max-w-md">
              <div className="text-center">
                <MapPin className="size-16 mx-auto mb-4 text-blue-500" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">GPS Tracking Map</h3>
                <p className="text-gray-600 mb-4">
                  {devices.filter(d => d.position).length > 0 
                    ? `Tracking ${devices.filter(d => d.position).length} active vehicles`
                    : "No GPS devices registered yet"
                  }
                </p>
                
                {/* Show device positions */}
                {devices.filter(d => d.position).length > 0 && (
                  <div className="mb-4 text-left">
                    <div className="text-sm font-semibold text-gray-700 mb-2">Active Vehicles:</div>
                    {devices.filter(d => d.position).map(device => (
                      <div key={device.id} className="text-xs text-gray-600 mb-1">
                        🚛 {device.name}: {device.position!.latitude.toFixed(4)}, {device.position!.longitude.toFixed(4)}
                      </div>
                    ))}
                  </div>
                )}
                
                <a
                  href="https://www.openstreetmap.org/?mlat=12.8797&mlon=121.7740&zoom=6"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors"
                >
                  🗺️ Open Live Map
                </a>
              </div>
            </div>
          </div>
          
          {/* Map overlay info */}
          <div className="absolute top-4 left-4 bg-white rounded-lg p-3 shadow-lg">
            <div className="text-xs font-semibold text-gray-700">Philippines GPS Tracking</div>
            <div className="text-xs text-gray-500">Live monitoring system</div>
          </div>
          
          <div className="absolute top-4 right-4 bg-white rounded-lg p-3 shadow-lg">
            <div className="text-xs font-semibold text-gray-700">Status</div>
            <div className="text-xs text-green-600">● Online</div>
          </div>
        </div>
        
        {/* Device List */}
        <div className="border-t border-slate-100 p-4 bg-slate-50/50">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">
            Tracked Devices
          </div>
          {devices.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <MapPin className="size-12 mx-auto mb-3 text-slate-300" />
              <div className="font-medium">No GPS devices registered</div>
              <div className="text-sm mt-1">Add devices in Traccar to see them here</div>
            </div>
          ) : (
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
          )}
        </div>
      </CardContent>
    </Card>
  );
}
