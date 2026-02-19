import { useEffect, useState, useRef } from 'react';
import { fetchTraccarDevices, fetchTraccarPositions, type TraccarDevice, type TraccarPosition } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { MapPin, Gauge, Navigation, AlertCircle, ExternalLink } from 'lucide-react';

interface DeviceWithPosition extends TraccarDevice {
  position?: TraccarPosition;
}

export function RealInteractiveMap() {
  console.log('[RealInteractiveMap] Component loading');
  const [devices, setDevices] = useState<DeviceWithPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  // Fetch devices and positions on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('[RealInteractiveMap] Loading GPS data...');
        setLoading(true);
        setError(null);
        
        const [devicesData, positionsData] = await Promise.all([
          fetchTraccarDevices(),
          fetchTraccarPositions(),
        ]);
        
        console.log('[RealInteractiveMap] Devices:', devicesData.length);
        console.log('[RealInteractiveMap] Positions:', positionsData.length);
        
        // Merge devices with their latest positions
        const merged = devicesData.map(device => {
          const position = positionsData.find(p => p.deviceId === device.id);
          return { ...device, position };
        });
        
        console.log('[RealInteractiveMap] Merged devices:', merged.length);
        setDevices(merged);
      } catch (err) {
        console.error('[RealInteractiveMap] Error loading GPS data:', err);
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

  // Initialize interactive map
  useEffect(() => {
    if (!mapRef.current || loading) return;

    console.log('[RealInteractiveMap] Initializing interactive map...');
    
    // Create a simple interactive map using HTML/CSS
    const mapContainer = mapRef.current;
    mapContainer.innerHTML = `
      <div style="width: 100%; height: 100%; position: relative; background: linear-gradient(45deg, #e3f2fd 25%, transparent 25%), linear-gradient(-45deg, #e3f2fd 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e3f2fd 75%), linear-gradient(-45deg, transparent 75%, #e3f2fd 75%); background-size: 20px 20px; background-position: 0 0, 0 10px, 10px -10px, -10px 0px;">
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;">
          <div style="font-size: 48px; margin-bottom: 16px;">🗺️</div>
          <div style="font-size: 18px; font-weight: bold; color: #1976d2; margin-bottom: 8px;">Interactive Map</div>
          <div style="font-size: 14px; color: #666; margin-bottom: 16px;">Philippines GPS Tracking</div>
          ${devices.filter(d => d.position).length > 0 ? `
            <div style="background: white; padding: 12px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin-bottom: 16px;">
              <div style="font-size: 14px; font-weight: bold; color: #333; margin-bottom: 8px;">🚛 Active Vehicles: ${devices.filter(d => d.position).length}</div>
              ${devices.filter(d => d.position).slice(0, 3).map(device => `
                <div style="font-size: 12px; color: #666; margin: 4px 0;">
                  📍 ${device.name}: ${device.position!.latitude.toFixed(4)}, ${device.position!.longitude.toFixed(4)}
                </div>
              `).join('')}
            </div>
          ` : `
            <div style="background: #fff3cd; padding: 12px; border-radius: 8px; border: 1px solid #ffeaa7; margin-bottom: 16px;">
              <div style="font-size: 14px; color: #856404;">📍 No GPS devices registered yet</div>
            </div>
          `}
          <button onclick="window.open('https://www.openstreetmap.org/?mlat=12.8797&mlon=121.7740&zoom=6', '_blank')" style="background: #4caf50; color: white; padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
            🌍 Open OpenStreetMap
          </button>
        </div>
      </div>
    `;
    
    console.log('[RealInteractiveMap] Interactive map initialized!');
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

  // Don't return early - always show the map, even with no devices

  return (
    <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
      <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
        <CardTitle className="flex items-center gap-2 text-slate-900 font-semibold">
          <MapPin className="size-5 text-slate-600" />
          Live GPS Tracking ({devices.length} devices)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {/* Interactive Map Container */}
        <div className="h-[500px] relative">
          <div 
            ref={mapRef} 
            className="w-full h-full border-2 border-blue-500"
            style={{ minHeight: '500px' }}
          />
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
