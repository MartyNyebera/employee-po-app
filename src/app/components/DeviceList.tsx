import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { MapPin, Users, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { fetchTraccarDevices, fetchTraccarPositions, type TraccarDevice, type TraccarPosition } from '../api/client';

interface DeviceWithPosition extends TraccarDevice {
  position?: TraccarPosition;
}

interface DeviceListProps {
  onDeviceSelect: (device: DeviceWithPosition) => void;
  selectedDeviceId?: number;
}

export function DeviceList({ onDeviceSelect, selectedDeviceId }: DeviceListProps) {
  const [devices, setDevices] = useState<DeviceWithPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch devices and positions
  const loadDevices = async () => {
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
      setError(err instanceof Error ? err.message : 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDevices();
    
    // Refresh every 30 seconds
    const interval = setInterval(loadDevices, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusBadge = (device: DeviceWithPosition) => {
    const status = device.status || 'offline';
    const hasRecentPosition = device.position && 
      (Date.now() - new Date(device.position.fixTime).getTime()) < 60000; // 1 minute
    
    if (hasRecentPosition) {
      return <Badge className="bg-green-50 text-green-700 border-green-200">Online</Badge>;
    } else if (status === 'online') {
      return <Badge className="bg-yellow-50 text-yellow-700 border-yellow-200">Idle</Badge>;
    } else {
      return <Badge className="bg-gray-50 text-gray-700 border-gray-200">Offline</Badge>;
    }
  };

  const getSpeed = (device: DeviceWithPosition) => {
    if (!device.position) return '0';
    return ((device.position.speed * 1.852)).toFixed(1); // knots to km/h
  };

  if (loading) {
    return (
      <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5">
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-slate-600">Loading devices...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 text-red-600">
            <WifiOff className="size-5" />
            <div>
              <div className="font-semibold">Connection Error</div>
              <div className="text-sm text-red-500">{error}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5">
      <CardHeader className="border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-slate-900">
            <Users className="size-5" />
            GPS Devices ({devices.length})
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={loadDevices}
            className="border-slate-200 hover:bg-slate-50"
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {devices.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <MapPin className="size-12 mx-auto mb-3 text-slate-300" />
            <div className="font-medium">No GPS devices found</div>
            <div className="text-sm mt-1">Add devices in Traccar to see them here</div>
          </div>
        ) : (
          <div className="space-y-2">
            {devices.map((device) => (
              <div
                key={device.id}
                onClick={() => onDeviceSelect(device)}
                className={`p-4 rounded-lg border cursor-pointer transition-all duration-200 hover:shadow-md ${
                  selectedDeviceId && selectedDeviceId === device.id
                    ? 'border-blue-300 bg-blue-50/50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="font-semibold text-slate-900">{device.name}</div>
                      {getStatusBadge(device)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-600">
                      <span>ID: {device.id}</span>
                      {device.position && (
                        <>
                          <span>•</span>
                          <span>Speed: {getSpeed(device)} km/h</span>
                          <span>•</span>
                          <span>Last seen: {new Date(device.position.fixTime).toLocaleTimeString()}</span>
                        </>
                      )}
                    </div>
                    {device.position && (
                      <div className="text-xs text-slate-500 mt-1">
                        📍 {device.position.latitude.toFixed(6)}, {device.position.longitude.toFixed(6)}
                      </div>
                    )}
                  </div>
                  <div className={`w-3 h-3 rounded-full ${
                    device.position && 
                    (Date.now() - new Date(device.position.fixTime).getTime()) < 60000
                      ? 'bg-green-500 animate-pulse'
                      : 'bg-gray-400'
                  }`} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
