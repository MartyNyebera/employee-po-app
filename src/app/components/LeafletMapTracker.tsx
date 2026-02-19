import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { MapPin, AlertCircle, Navigation, Gauge, RefreshCw, Plus, Filter, Settings, Wifi, WifiOff } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet/dist/leaflet.css';

// Import Leaflet CSS
const leafletCSS = `
  .leaflet-container {
    height: 100%;
    width: 100%;
  }
  .leaflet-control-container {
    margin-bottom: 10px !important;
  }
  .leaflet-popup-content-wrapper {
    border-radius: 8px !important;
  }
  .leaflet-popup-content {
    margin: 0 !important;
  }
  .custom-marker {
    background: #4285f4;
    color: white;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: bold;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  }
`;

// Add CSS to document
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = leafletCSS;
  document.head.appendChild(style);
}

// Define types locally
interface DeviceWithPosition {
  id: number;
  name: string;
  uniqueId: string;
  status: string;
  lastUpdate: string | null;
  positionId: number | null;
  category: string;
  position?: {
    id: number;
    deviceId: number;
    latitude: number;
    longitude: number;
    speed: number;
    course: number;
    altitude: number;
    accuracy: number;
    fixTime: string;
    deviceTime: string;
    serverTime: string;
    attributes: Record<string, unknown>;
  };
}

export function LeafletMapTracker() {
  const [devices, setDevices] = useState<DeviceWithPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapRef.current) return;

    const initializeMap = () => {
      try {
        // Clear any existing map
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }

        // Initialize map
        const map = L.map(mapRef.current!, {
          center: [14.5995, 120.9842],
          zoom: 13,
          zoomControl: true
        });

        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
          tileSize: 256,
          zoomOffset: 0
        }).addTo(map);

        mapInstanceRef.current = map;
        setLoading(false);
        console.log('Map initialized successfully');
      } catch (err) {
        console.error('Error initializing map:', err);
        setError('Failed to load map. Please check your internet connection.');
        setLoading(false);
      }
    };

    // Initialize map immediately
    initializeMap();

    // Also try to initialize after a delay
    const timeoutId = setTimeout(initializeMap, 1000);

    return () => {
      clearTimeout(timeoutId);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update markers when devices change
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    // Clear existing markers
    markersRef.current.forEach(marker => {
      mapInstanceRef.current!.removeLayer(marker);
    });
    markersRef.current = [];

    // Add new markers
    devices.forEach(device => {
      if (device.position) {
        // Create custom icon
        const icon = L.divIcon({
          className: 'custom-marker',
          html: `
            <div style="
              background: ${device.category === 'phone' ? '#4285f4' : '#007bff'};
              color: white;
              border-radius: 50%;
              width: 24px;
              height: 24px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 12px;
              font-weight: bold;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            ">
              ${device.category === 'phone' ? '📱' : '🚗'}
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        const marker = L.marker([device.position.latitude, device.position.longitude], { icon })
          .addTo(mapInstanceRef.current);

        // Create popup content
        const popupContent = `
          <div style="
            padding: 10px;
            font-family: Arial, sans-serif;
            min-width: 200px;
          ">
            <h3 style="margin: 0 0 8px 0; color: #333; font-size: 14px;">${device.name}</h3>
            <p style="margin: 4px 0; font-size: 12px; color: #666;">
              <strong>Status:</strong> ${device.status}<br>
              <strong>Speed:</strong> ${device.position.speed.toFixed(1)} km/h<br>
              <strong>Direction:</strong> ${device.position.course}°<br>
              <strong>Accuracy:</strong> ${device.position.accuracy}m<br>
              <strong>Coordinates:</strong> ${device.position.latitude.toFixed(6)}, ${device.position.longitude.toFixed(6)}<br>
              <strong>Last Update:</strong> ${new Date(device.lastUpdate || '').toLocaleString()}
            </p>
          </div>
        `;

        marker.bindPopup(popupContent);
        markersRef.current.push(marker);
      }
    });

    // Fit map to show all markers
    if (markersRef.current.length > 0 && mapInstanceRef.current) {
      const group = new L.FeatureGroup(markersRef.current);
      mapInstanceRef.current!.fitBounds(group.getBounds().pad(0.1));
    }
  }, [devices]);

  // GPS data receiver
  useEffect(() => {
    const loadMockData = () => {
      const mockDevices = [
        {
          id: 1,
          name: 'Delivery Truck 001',
          uniqueId: 'TRUCK001',
          status: 'online',
          lastUpdate: new Date().toISOString(),
          positionId: 1,
          category: 'truck',
          position: {
            id: 1,
            deviceId: 1,
            latitude: 14.5995,
            longitude: 120.9842,
            speed: 45.2,
            course: 90,
            altitude: 15,
            accuracy: 5,
            fixTime: new Date().toISOString(),
            deviceTime: new Date().toISOString(),
            serverTime: new Date().toISOString(),
            attributes: {}
          }
        }
      ];

      setDevices(mockDevices);
      setLastUpdated(new Date());
      setLoading(false);
      setError(null);
    };

    setLoading(true);
    setError(null);

    // Listen for GPS data
    const handleGPSData = (e: StorageEvent) => {
      if ((e.key === 'phoneGPSData' || e.key === 'laptopGPSData') && e.newValue) {
        try {
          const gpsData = JSON.parse(e.newValue);
          console.log('Received GPS data:', e.key, gpsData);
          
          // Add mock vehicles and GPS device
          const mockDevices = [
            {
              id: 1,
              name: 'Delivery Truck 001',
              uniqueId: 'TRUCK001',
              status: 'online',
              lastUpdate: new Date().toISOString(),
              positionId: 1,
              category: 'truck',
              position: {
                id: 1,
                deviceId: 1,
                latitude: 14.5995,
                longitude: 120.9842,
                speed: 45.2,
                course: 90,
                altitude: 15,
                accuracy: 5,
                fixTime: new Date().toISOString(),
                deviceTime: new Date().toISOString(),
                serverTime: new Date().toISOString(),
                attributes: {}
              }
            }
          ];

          setDevices([gpsData, ...mockDevices]);
          setLastUpdated(new Date());
          setLoading(false);
          setError(null);
        } catch (err) {
          console.log('Error parsing GPS data:', err);
        }
      }
    };

    // Add event listener
    window.addEventListener('storage', handleGPSData);

    // Add polling mechanism
    let lastGPSData = {
      phone: localStorage.getItem('phoneGPSData'),
      laptop: localStorage.getItem('laptopGPSData')
    };

    const checkGPSData = () => {
      const currentPhoneData = localStorage.getItem('phoneGPSData');
      const currentLaptopData = localStorage.getItem('laptopGPSData');
      
      if (currentPhoneData !== lastGPSData.phone && currentPhoneData) {
        try {
          const phoneData = JSON.parse(currentPhoneData);
          console.log('Phone GPS data updated:', phoneData);
          const storageEvent = {
            key: 'phoneGPSData',
            newValue: currentPhoneData,
            oldValue: lastGPSData.phone,
            storageArea: localStorage,
            url: window.location.href
          } as StorageEvent;
          handleGPSData(storageEvent);
          lastGPSData.phone = currentPhoneData;
        } catch (err) {
          console.log('Error parsing phone GPS data:', err);
        }
      }
      
      if (currentLaptopData !== lastGPSData.laptop && currentLaptopData) {
        try {
          const laptopData = JSON.parse(currentLaptopData);
          console.log('Laptop GPS data updated:', laptopData);
          const storageEvent = {
            key: 'laptopGPSData',
            newValue: currentLaptopData,
            oldValue: lastGPSData.laptop,
            storageArea: localStorage,
            url: window.location.href
          } as StorageEvent;
          handleGPSData(storageEvent);
          lastGPSData.laptop = currentLaptopData;
        } catch (err) {
          console.log('Error parsing laptop GPS data:', err);
        }
      }
    };

    // Check for existing GPS data
    const existingPhoneData = localStorage.getItem('phoneGPSData');
    const existingLaptopData = localStorage.getItem('laptopGPSData');
    
    if (existingPhoneData) {
      try {
        const phoneData = JSON.parse(existingPhoneData);
        console.log('Received phone GPS data:', phoneData);
        const storageEvent = {
          key: 'phoneGPSData',
          newValue: existingPhoneData,
          oldValue: null,
          storageArea: localStorage,
          url: window.location.href
        } as StorageEvent;
        handleGPSData(storageEvent);
        lastGPSData.phone = existingPhoneData;
      } catch (err) {
        console.log('Error parsing phone GPS data:', err);
      }
    }
    
    if (existingLaptopData) {
      try {
        const laptopData = JSON.parse(existingLaptopData);
        console.log('Received laptop GPS data:', laptopData);
        const storageEvent = {
          key: 'laptopGPSData',
          newValue: existingLaptopData,
          oldValue: null,
          storageArea: localStorage,
          url: window.location.href
        } as StorageEvent;
        handleGPSData(storageEvent);
        lastGPSData.laptop = existingLaptopData;
      } catch (err) {
        console.log('Error parsing laptop GPS data:', err);
      }
    }
    
    if (!existingPhoneData && !existingLaptopData) {
      loadMockData();
    }

    // Start polling every 2 seconds
    const pollInterval = setInterval(checkGPSData, 2000);

    return () => {
      window.removeEventListener('storage', handleGPSData);
      clearInterval(pollInterval);
    };
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Just trigger a reload of current GPS data
    window.location.reload();
  };

  if (loading) {
    return (
      <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5 overflow-hidden dark:bg-slate-800/50 dark:border dark:border-white/10 dark:shadow-xl dark:shadow-black/20">
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-slate-600 dark:text-slate-400">Loading Free Map...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5 overflow-hidden dark:bg-slate-800/50 dark:border dark:border-white/10 dark:shadow-xl dark:shadow-black/20">
        <CardContent className="p-6">
          <div className="flex items-start gap-3 text-amber-600">
            <MapPin className="size-5 mt-0.5" />
            <div>
              <div className="font-semibold">Map Error</div>
              <div className="text-sm text-amber-500 mt-1">{error}</div>
              <div className="text-xs text-slate-500 mt-2">
                Please check your internet connection and try again.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white border border-slate-200/60 shadow-2xl shadow-slate-900/5 overflow-hidden dark:bg-slate-800/50 dark:border dark:border-white/10 dark:shadow-xl dark:shadow-black/20">
      {/* Header */}
      <CardHeader className="border-b border-slate-200/60 bg-gradient-to-r from-white to-slate-50/50 px-6 py-6 dark:border-b dark:border-white/5 dark:from-slate-800/30 dark:to-slate-700/30">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 bg-green-100 rounded-lg dark:bg-green-500/20">
                <MapPin className="size-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <CardTitle className="text-slate-900 font-bold text-lg dark:text-slate-100">
                  Free Map Tracker
                </CardTitle>
                <p className="text-slate-600 text-sm dark:text-slate-400">
                  Real-time GPS Monitoring with OpenStreetMap (Free)
                </p>
              </div>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700 transition-all duration-150"
            >
              <RefreshCw className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
        
        {/* Last Updated */}
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${devices.filter(d => d.position).length > 0 ? 'bg-green-500' : 'bg-gray-400'}`} />
            <span>{devices.filter(d => d.position).length} active</span>
          </div>
          <span>•</span>
          <span>Last updated: {lastUpdated.toLocaleTimeString()}</span>
          <span>•</span>
          <span>Powered by OpenStreetMap (Free)</span>
        </div>
      </CardHeader>
      
      {/* Map Container */}
      <CardContent className="p-0">
        <div 
          ref={mapRef} 
          className="w-full h-[600px] relative"
          style={{ minHeight: '600px' }}
        />
      </CardContent>
    </Card>
  );
}
