import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { MapPin, AlertCircle, RefreshCw } from 'lucide-react';

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
    L: any;
    initMap: () => void;
  }
}

export function SimpleMapTracker() {
  const [devices, setDevices] = useState<DeviceWithPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  // Load Leaflet scripts and CSS
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const loadLeaflet = () => {
      // Add timeout to prevent freeze
      timeoutId = setTimeout(() => {
        setError('Map loading timeout - please refresh');
        setLoading(false);
      }, 10000); // 10 second timeout

      // Load CSS
      const cssLink = document.createElement('link');
      cssLink.rel = 'stylesheet';
      cssLink.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(cssLink);

      // Load JS
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => {
        clearTimeout(timeoutId);
        console.log('Leaflet loaded successfully');
        initializeMap();
      };
      script.onerror = () => {
        clearTimeout(timeoutId);
        console.error('Failed to load Leaflet');
        setError('Failed to load map library');
        setLoading(false);
      };
      document.head.appendChild(script);
    };

    loadLeaflet();

    return () => {
      // Cleanup on unmount
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  // Initialize map with retry mechanism
  const initializeMap = () => {
    if (!mapRef.current) {
      console.log('Map ref not ready');
      return;
    }

    try {
      // Clear existing map
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      // Check if Leaflet is loaded
      if (!window.L) {
        console.log('Leaflet not loaded yet');
        setError('Map library not loaded - please wait');
        setLoading(false);
        return;
      }

      // Initialize map
      const map = window.L.map(mapRef.current, {
        center: [13.9334, 121.1471],
        zoom: 15,
        zoomControl: true
      });

      // Add OpenStreetMap tiles
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: ' OpenStreetMap contributors',
        maxZoom: 19,
        tileSize: 256,
        zoomOffset: 0
      }).addTo(map);

      mapInstanceRef.current = map;
      setMapLoaded(true);
      setLoading(false);
      setError(null);
      console.log('Map initialized successfully');
    } catch (err) {
      console.error('Error initializing map:', err);
      setError('Failed to initialize map: ' + (err as Error).message);
      setLoading(false);
      setMapLoaded(false);
    }
  };

  // Retry map initialization
  const retryMapInitialization = () => {
    console.log('Retrying map initialization...');
    setError(null);
    setLoading(true);
    
    // Wait a moment and try again
    setTimeout(() => {
      if (window.L) {
        initializeMap();
      } else {
        console.log('Leaflet still not loaded, retrying...');
        // Retry after 2 seconds
        setTimeout(retryMapInitialization, 2000);
      }
    }, 1000);
  };

  // Update markers when devices change
  useEffect(() => {
    console.log('Devices changed:', devices.length, devices);
    
    if (!mapInstanceRef.current || !window.L) {
      console.log('Map not ready for marker updates');
      return;
    }
    
    // Only update markers if map is loaded
    if (!mapLoaded) {
      console.log('Map not loaded yet, skipping marker updates');
      return;
    }

    // Clear existing markers
    markersRef.current.forEach(marker => {
      mapInstanceRef.current.removeLayer(marker);
    });
    markersRef.current = [];

    // Add new markers
    devices.forEach(device => {
      if (device.position) {
        console.log('Adding marker for:', device.name, 'at', device.position.latitude, device.position.longitude);
        
        const marker = window.L.marker([device.position.latitude, device.position.longitude])
          .addTo(mapInstanceRef.current);

        const popupContent = `
          <div style="padding: 8px; font-family: Arial, sans-serif;">
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
    if (markersRef.current.length > 0) {
      const group = new window.L.FeatureGroup(markersRef.current);
      mapInstanceRef.current.fitBounds(group.getBounds().pad(0.1));
      console.log('Map fitted to show', markersRef.current.length, 'markers');
    }
  }, [devices]);

  // GPS data receiver
  useEffect(() => {
    const loadMockData = () => {
      // No mock data - only show GPS devices
      console.log('No GPS data found - waiting for GPS input');
      setDevices([]);
      setLastUpdated(new Date());
      setLoading(false);
      setError(null);
    };

    setLoading(true);
    setError(null);

    // Listen for GPS data
    const handleGPSData = (e: StorageEvent) => {
      console.log('Storage event:', e.key, e.newValue ? 'has data' : 'no data');
      
      if ((e.key === 'phoneGPSData' || e.key === 'laptopGPSData') && e.newValue) {
        try {
          const gpsData = JSON.parse(e.newValue);
          console.log('✅ Received GPS data:', e.key, gpsData);
          console.log('GPS coordinates:', gpsData.position.latitude, gpsData.position.longitude);
          
          // Only show your GPS device - no mock devices
          console.log('Setting devices with GPS data only...');
          setDevices([gpsData]);
          setLastUpdated(new Date());
          setLoading(false);
          setError(null);
        } catch (err) {
          console.log('❌ Error parsing GPS data:', err);
        }
      }
    };

    // Add event listener
    window.addEventListener('storage', handleGPSData);

    // Add polling mechanism with error handling
    let lastGPSData = {
      phone: localStorage.getItem('phoneGPSData'),
      laptop: localStorage.getItem('laptopGPSData')
    };

    const checkGPSData = () => {
      try {
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
      } catch (err) {
        console.log('Error in GPS polling:', err);
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

    // Start polling every 5 seconds (slower to prevent freeze)
    const pollInterval = setInterval(checkGPSData, 5000);

    return () => {
      window.removeEventListener('storage', handleGPSData);
      clearInterval(pollInterval);
    };
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    
    if (mapLoaded) {
      // Map is loaded, just refresh the data
      const currentPhoneData = localStorage.getItem('phoneGPSData');
      const currentLaptopData = localStorage.getItem('laptopGPSData');
      
      if (currentPhoneData) {
        try {
          const phoneData = JSON.parse(currentPhoneData);
          setDevices([phoneData]);
          setLastUpdated(new Date());
        } catch (err) {
          console.log('Error parsing phone GPS data:', err);
        }
      }
      
      if (currentLaptopData) {
        try {
          const laptopData = JSON.parse(currentLaptopData);
          setDevices([laptopData]);
          setLastUpdated(new Date());
        } catch (err) {
          console.log('Error parsing laptop GPS data:', err);
        }
      }
    } else {
      // Map not loaded, try to initialize
      retryMapInitialization();
    }
    
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const handleRetryMap = () => {
    console.log('User clicked retry map');
    retryMapInitialization();
  };

  if (loading) {
    return (
      <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5 overflow-hidden dark:bg-slate-800/50 dark:border dark:border-white/10 dark:shadow-xl dark:shadow-black/20">
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-slate-600 dark:text-slate-400">Loading Map...</span>
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
                  Simple Map Tracker
                </CardTitle>
                <p className="text-slate-600 text-sm dark:text-slate-400">
                  Real-time GPS Monitoring (Working Map)
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
            
            {!mapLoaded && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetryMap}
                className="border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700 transition-all duration-150"
              >
                <RefreshCw className="size-4" />
                Retry Map
              </Button>
            )}
          </div>
        </div>
        
        {/* Last Updated */}
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${devices.filter(d => d.position).length > 0 ? 'bg-green-500' : 'bg-gray-400'}`} />
            <span>{devices.filter(d => d.position).length} GPS device{devices.filter(d => d.position).length !== 1 ? 's' : ''}</span>
          </div>
          <span>•</span>
          <span>Last updated: {lastUpdated.toLocaleTimeString()}</span>
          <span>•</span>
          <span>Powered by OpenStreetMap (CDN)</span>
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
