import { useState } from 'react';
import { DeviceList } from './DeviceList';
import { SingleDeviceTracker } from './SingleDeviceTracker';
import { type TraccarDevice, type TraccarPosition } from '../api/client';

interface DeviceWithPosition extends TraccarDevice {
  position?: TraccarPosition;
}

export function GPSMonitoring() {
  const [selectedDevice, setSelectedDevice] = useState<DeviceWithPosition | null>(null);

  const handleDeviceSelect = (device: DeviceWithPosition) => {
    setSelectedDevice(device);
  };

  const handleBackToList = () => {
    setSelectedDevice(null);
  };

  if (selectedDevice) {
    return (
      <SingleDeviceTracker 
        device={selectedDevice} 
        onBack={handleBackToList}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-100 rounded-lg">
          🗺️
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900">GPS Monitoring</h2>
          <p className="text-slate-600 text-sm">Track and monitor your fleet vehicles in real-time</p>
        </div>
      </div>
      
      <DeviceList 
        onDeviceSelect={handleDeviceSelect}
      />
    </div>
  );
}
