import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { MapPin, Navigation, RefreshCw } from 'lucide-react';

interface GPSLocation {
  vehicleId: string;
  lat: number;
  lng: number;
  speed: number | null;
  heading: number | null;
  timestamp: number;
}

declare global {
  interface Window {
    maplibregl: any;
  }
}

export function SimpleLiveMap() {
  const [vehicleLocation, setVehicleLocation] = useState<GPSLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [targetVehicleId] = useState('uncle-phone'); // Track uncle's phone
  
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  // Load MapLibre GL JS from CDN
  useEffect(() => {
    const loadMapLibre = () => {
      console.log('Starting to load MapLibre GL JS...');
      
      if (window.maplibregl) {
        console.log('MapLibre GL JS already loaded');
        setMapLoaded(true);
        setLoading(false);
        return;
      }

      // Load CSS
      const cssLink = document.createElement('link');
      cssLink.rel = 'stylesheet';
      cssLink.href = 'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css';
      document.head.appendChild(cssLink);

      // Load JS
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js';
      script.onload = () => {
        console.log('MapLibre GL JS loaded successfully');
        setMapLoaded(true);
        setLoading(false);
      };
      script.onerror = () => {
        console.error('Failed to load MapLibre GL JS');
        setError('Failed to load map library');
        setLoading(false);
      };
      document.head.appendChild(script);
    };

    loadMapLibre();
  }, []);

  // Initialize map when MapLibre is loaded
  useEffect(() => {
    if (!mapLoaded || !mapContainerRef.current || !window.maplibregl) {
      console.log('Map initialization conditions not met:', {
        mapLoaded,
        mapContainerRef: !!mapContainerRef.current,
        maplibregl: !!window.maplibregl
      });
      return;
    }

    try {
      console.log('Initializing map...');
      
      const map = new window.maplibregl.Map({
        container: mapContainerRef.current,
        style: 'https://tiles.openfreemap.org/styles/liberty',
        center: [121.0, 14.6],
        zoom: 12,
        attributionControl: false
      });

      map.on('load', () => {
        console.log('Map loaded successfully');
        map.addControl(new window.maplibregl.AttributionControl({ compact: true }));
        map.addControl(new window.maplibregl.NavigationControl());
      });

      mapRef.current = map;
      console.log('Map initialized successfully');
    } catch (err) {
      console.error('Error initializing map:', err);
      setError('Failed to initialize map: ' + (err as Error).message);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [mapLoaded]);

  // Listen for GPS data from localStorage
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key && e.key.startsWith('gpsData_') && e.newValue) {
        try {
          const gpsData = JSON.parse(e.newValue);
          if (gpsData.vehicleId === targetVehicleId) {
            console.log('Received Uncle GPS data:', gpsData);
            setVehicleLocation(gpsData);
            setError(null);
          }
        } catch (err) {
          console.error('Error parsing GPS data:', err);
        }
      }
    };

    // Listen for storage events
    window.addEventListener('storage', handleStorageChange);

    // Check for existing GPS data for uncle
    const uncleKey = `gpsData_${targetVehicleId}`;
    const existingData = localStorage.getItem(uncleKey);
    if (existingData) {
      try {
        const gpsData = JSON.parse(existingData);
        setVehicleLocation(gpsData);
        console.log('Loaded existing Uncle GPS data:', gpsData);
      } catch (err) {
        console.error('Error parsing existing Uncle GPS data:', err);
      }
    }

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Update marker when location changes
  useEffect(() => {
    if (!vehicleLocation || !mapRef.current || !window.maplibregl) {
      console.log('Marker update conditions not met:', {
        vehicleLocation: !!vehicleLocation,
        map: !!mapRef.current,
        maplibregl: !!window.maplibregl
      });
      return;
    }

    if (!markerRef.current) {
      // Create marker
      const markerElement = document.createElement('div');
      markerElement.className = 'vehicle-marker';
      markerElement.innerHTML = `
        <div class="vehicle-icon" style="transform: rotate(${vehicleLocation.heading || 0}deg)">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L4 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-8-5z" 
                  fill="#3b82f6" stroke="#1e40af" stroke-width="1"/>
            <path d="M12 8l-2 2h4l-2-2z" fill="white"/>
          </svg>
        </div>
      `;
      
      const marker = new window.maplibregl.Marker({
        element: markerElement,
        anchor: 'center'
      })
        .setLngLat([vehicleLocation.lng, vehicleLocation.lat])
        .addTo(mapRef.current);

      markerRef.current = marker;
      console.log('Marker created at:', [vehicleLocation.lng, vehicleLocation.lat]);
    } else {
      // Update existing marker
      markerRef.current.setLngLat([vehicleLocation.lng, vehicleLocation.lat]);
      console.log('Marker updated to:', [vehicleLocation.lng, vehicleLocation.lat]);
    }
  }, [vehicleLocation]);

  if (loading) {
    return (
      <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5 overflow-hidden dark:bg-slate-800/50">
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-slate-600 dark:text-slate-400">Loading Simple Live Map...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5 overflow-hidden dark:bg-slate-800/50">
        <CardContent className="p-6">
          <div className="flex items-start gap-3 text-red-600">
            <MapPin className="size-5 mt-0.5" />
            <div>
              <div className="font-semibold">Map Error</div>
              <div className="text-sm text-red-500 mt-1">{error}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white border border-slate-200/60 shadow-2xl shadow-slate-900/5 overflow-hidden dark:bg-slate-800/50">
      <CardHeader className="border-b border-slate-200/60 bg-gradient-to-r from-white to-slate-50/50 px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-slate-900 font-bold text-lg">
              🗺️ Simple Live Map
            </CardTitle>
            <p className="text-slate-600 text-sm">
              Direct GPS tracking - no complex service
            </p>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // Check for Uncle's GPS data specifically
              const uncleKey = `gpsData_${targetVehicleId}`;
              const uncleData = localStorage.getItem(uncleKey);
              if (uncleData) {
                try {
                  const gpsData = JSON.parse(uncleData);
                  setVehicleLocation(gpsData);
                  console.log('Manually loaded Uncle GPS data:', gpsData);
                } catch (err) {
                  console.error('Error parsing Uncle GPS data:', err);
                }
              } else {
                console.log('No Uncle GPS data found');
              }
            }}
            className="border-slate-200 hover:bg-slate-50"
          >
            <RefreshCw className="size-4" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      
      <div className="relative">
        {/* Status Overlay */}
        {vehicleLocation && (
          <div className="absolute top-4 left-4 z-10 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-4 border border-slate-200/60">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between gap-4">
                <span>Lat:</span>
                <span className="font-mono">{vehicleLocation.lat.toFixed(6)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Lng:</span>
                <span className="font-mono">{vehicleLocation.lng.toFixed(6)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Speed:</span>
                <span className="font-mono">{vehicleLocation.speed ? `${vehicleLocation.speed.toFixed(1)} km/h` : 'N/A'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Updated:</span>
                <span className="font-mono">{new Date(vehicleLocation.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>
          </div>
        )}
        
        {/* Map */}
        <div 
          ref={mapContainerRef} 
          className="w-full h-[600px]"
          style={{ minHeight: '600px' }}
        />
      </div>
      
      <div className="px-6 py-3 border-t border-slate-200/60">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>Simple Live Map - Direct GPS Tracking</span>
            <span>•</span>
            <span>Powered by MapLibre GL + OpenFreeMap</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${vehicleLocation ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            <span>{vehicleLocation ? 'GPS Active' : 'Waiting for GPS'}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
