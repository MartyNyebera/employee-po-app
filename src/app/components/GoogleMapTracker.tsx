import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { MapPin, AlertCircle, Navigation, Gauge, RefreshCw, Plus, Filter, Settings, Wifi, WifiOff } from 'lucide-react';

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

declare global {
  interface Window {
    google: any;
    initMap: () => void;
  }
}

export function GoogleMapTracker() {
  const [devices, setDevices] = useState<DeviceWithPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  // Load Google Maps API
  useEffect(() => {
    const loadGoogleMaps = () => {
      if (window.google && window.google.maps) {
        setMapLoaded(true);
        initializeMap();
        return;
      }

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=AIzaSyBk1Xe6Y9l8Z7W2Q3R4T5U6V7W8X9Y0Z1&libraries=geometry&callback=initMap`;
      script.async = true;
      script.defer = true;
      
      window.initMap = () => {
        setMapLoaded(true);
        initializeMap();
      };
      
      script.onerror = () => {
        setError('Failed to load Google Maps API. Please check your API key.');
        setLoading(false);
      };
      
      document.head.appendChild(script);
    };

    loadGoogleMaps();
  }, []);

  // Initialize Google Map
  const initializeMap = () => {
    if (!mapRef.current || !window.google) return;

    const mapOptions = {
      center: { lat: 14.5995, lng: 120.9842 }, // Manila
      zoom: 13,
      mapTypeId: window.google.maps.MapTypeId.ROADMAP,
      styles: [
        {
          featureType: "poi",
          elementType: "labels",
          stylers: [{ visibility: "off" }]
        },
        {
          featureType: "transit",
          elementType: "labels",
          stylers: [{ visibility: "off" }]
        }
      ]
    };

    const map = new window.google.maps.Map(mapRef.current, mapOptions);
    mapInstanceRef.current = map;
    
    setLoading(false);
  };

  // Update markers when devices change
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    // Add new markers
    devices.forEach(device => {
      if (device.position) {
        const marker = new window.google.maps.Marker({
          position: { lat: device.position.latitude, lng: device.position.longitude },
          map: mapInstanceRef.current,
          title: device.name,
          icon: {
            url: device.category === 'phone' 
              ? 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiIGZpbGw9IiM0Mjg1RjQiLz4KPHN2ZyB4PSI4IiB5PSI4IiB3aWR0aD0iOCIgaGVpZ2h0PSI4IHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPgo8cGF0aCBkPSJNMTIgMEMxMiA1IDcuNSA1IDcuNSAxMFMxMiAyMCAxMiAyMFMxNi41IDIwIDE2LjUgMTJTMTIgNSAxMiA1WiIgZmlsbD0iIzAwMDAwMCIvPgo8L3N2Zz4KPC9zdmc+'
              : 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMiIgeT0iOCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjE2IiByeD0iMiIgZmlsbD0iIzAwN0RmRiIvPgo8L3N2Zz4K',
            scaledSize: new window.google.maps.Size(24, 24),
            anchor: new window.google.maps.Point(12, 12)
          }
        });

        // Add info window
        const infoWindow = new window.google.maps.InfoWindow({
          content: `
            <div style="padding: 8px; font-family: Arial, sans-serif;">
              <h3 style="margin: 0 0 8px 0; color: #333;">${device.name}</h3>
              <p style="margin: 4px 0; font-size: 12px;">
                <strong>Status:</strong> ${device.status}<br>
                <strong>Speed:</strong> ${device.position.speed.toFixed(1)} km/h<br>
                <strong>Direction:</strong> ${device.position.course}°<br>
                <strong>Accuracy:</strong> ${device.position.accuracy}m<br>
                <strong>Last Update:</strong> ${new Date(device.lastUpdate || '').toLocaleString()}
              </p>
            </div>
          `
        });

        marker.addListener('click', () => {
          infoWindow.open(mapInstanceRef.current, marker);
        });

        markersRef.current.push(marker);
      }
    });

    // Fit map to show all markers
    if (markersRef.current.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      markersRef.current.forEach(marker => {
        bounds.extend(marker.getPosition());
      });
      mapInstanceRef.current.fitBounds(bounds);
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
            <span className="ml-3 text-slate-600 dark:text-slate-400">Loading Google Maps...</span>
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
              <div className="font-semibold">Google Maps Error</div>
              <div className="text-sm text-amber-500 mt-1">{error}</div>
              <div className="text-xs text-slate-500 mt-2">
                Please check your Google Maps API key and billing settings.
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
              <div className="p-2 bg-amber-100 rounded-lg dark:bg-amber-500/20">
                <MapPin className="size-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <CardTitle className="text-slate-900 font-bold text-lg dark:text-slate-100">
                  Google Maps Tracker
                </CardTitle>
                <p className="text-slate-600 text-sm dark:text-slate-400">
                  Real-time GPS Monitoring with Google Maps
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
          <span>Powered by Google Maps API</span>
        </div>
      </CardHeader>
      
      {/* Google Map Container */}
      <CardContent className="p-0">
        <div 
          ref={mapRef} 
          className="w-full h-[600px] relative"
          style={{ minHeight: '600px' }}
        >
          {!mapLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-800">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-slate-600 dark:text-slate-400">Loading Google Maps...</p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
