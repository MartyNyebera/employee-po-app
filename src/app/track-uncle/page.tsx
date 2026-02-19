'use client';

import { useEffect, useState } from 'react';

interface GPSLocation {
  vehicleId: string;
  lat: number;
  lng: number;
  speed: number | null;
  heading: number | null;
  timestamp: number;
}

export default function TrackUnclePage() {
  const [isTracking, setIsTracking] = useState(false);
  const [location, setLocation] = useState<GPSLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState(0);
  
  const vehicleId = 'uncle-phone'; // Fixed vehicle ID for uncle
  
  const sendLocation = async (position: GeolocationPosition) => {
    const locationData: GPSLocation = {
      vehicleId,
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      speed: position.coords.speed ? position.coords.speed * 3.6 : null, // Convert m/s to km/h
      heading: position.coords.heading || 0, // Ensure heading is not null
      timestamp: Date.now()
    };

    try {
      // Save to localStorage directly
      localStorage.setItem(`gpsData_${vehicleId}`, JSON.stringify(locationData));
      
      // Trigger storage event for immediate pickup
      window.dispatchEvent(new StorageEvent('storage', {
        key: `gpsData_${vehicleId}`,
        newValue: JSON.stringify(locationData),
        oldValue: null,
        storageArea: localStorage,
        url: window.location.href
      }));
      
      setLocation(locationData);
      setSentCount(prev => prev + 1);
      setSuccess('✅ Location sent to family!');
      setError(null);
      console.log('Uncle location sent:', locationData);
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error sending location:', err);
      setError('❌ Failed to send location');
      setSuccess(null);
    }
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      setError('❌ GPS not supported on this phone');
      return;
    }

    setIsTracking(true);
    setError(null);
    setSuccess(null);

    const watchId = navigator.geolocation.watchPosition(
      sendLocation,
      (err) => {
        console.error('GPS error:', err);
        setError(`❌ GPS Error: ${err.message}`);
        setIsTracking(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );

    // Send initial location immediately
    navigator.geolocation.getCurrentPosition(
      sendLocation,
      (err) => {
        console.error('Initial location error:', err);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );

    // Store watchId for cleanup
    (window as any).uncleWatchId = watchId;
  };

  const stopTracking = () => {
    if ((window as any).uncleWatchId) {
      navigator.geolocation.clearWatch((window as any).uncleWatchId);
      delete (window as any).uncleWatchId;
    }
    setIsTracking(false);
  };

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if ((window as any).uncleWatchId) {
        navigator.geolocation.clearWatch((window as any).uncleWatchId);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto">
          {/* Header */}
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 dark:bg-slate-800">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              👨‍👦 Uncle Phone Tracker
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Share your location with family
            </p>
            
            {/* Status */}
            <div className="mt-4 flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${
                isTracking ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
              }`} />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {isTracking ? '📍 Sharing Location' : '⏸️ Not Sharing'}
              </span>
            </div>
          </div>

          {/* Main Card */}
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 dark:bg-slate-800">
            <div className="text-center mb-6">
              <div className="text-6xl mb-4">📱</div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
                Location Sharing
              </h2>
              <p className="text-slate-600 dark:text-slate-400 text-sm">
                Your family can see you on the live map
              </p>
            </div>

            {!isTracking ? (
              <button
                onClick={startTracking}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-xl transition-colors duration-200 flex items-center justify-center gap-2 text-lg"
              >
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                📍 Start Sharing Location
              </button>
            ) : (
              <button
                onClick={stopTracking}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-6 rounded-xl transition-colors duration-200 flex items-center justify-center gap-2 text-lg"
              >
                <div className="w-6 h-6 bg-white rounded-sm" />
                ⏹️ Stop Sharing
              </button>
            )}

            <div className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
              <p>• Updates every 2 seconds</p>
              <p>• High accuracy GPS</p>
              <p>• Keep this page open</p>
            </div>
          </div>

          {/* Current Location */}
          {location && (
            <div className="bg-white rounded-2xl shadow-xl p-6 dark:bg-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
                📍 Your Current Location
              </h3>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Latitude:</span>
                  <span className="font-mono text-slate-900 dark:text-slate-100">
                    {location.lat.toFixed(6)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Longitude:</span>
                  <span className="font-mono text-slate-900 dark:text-slate-100">
                    {location.lng.toFixed(6)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Speed:</span>
                  <span className="font-mono text-slate-900 dark:text-slate-100">
                    {location.speed ? `${location.speed.toFixed(1)} km/h` : 'Still'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Last Update:</span>
                  <span className="font-mono text-slate-900 dark:text-slate-100">
                    {new Date(location.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Locations Sent:</span>
                  <span className="font-mono text-slate-900 dark:text-slate-100">
                    {sentCount}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/20 dark:border-red-800">
              <p className="text-red-600 dark:text-red-400 text-center">{error}</p>
            </div>
          )}
          
          {success && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg dark:bg-green-900/20 dark:border-green-800">
              <p className="text-green-600 dark:text-green-400 text-center">{success}</p>
            </div>
          )}

          {/* Instructions */}
          <div className="mt-6 bg-blue-50 rounded-xl p-4 dark:bg-blue-900/20">
            <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
              📋 Instructions:
            </h4>
            <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
              <li>• Click "Start Sharing Location"</li>
              <li>• Allow GPS permissions when asked</li>
              <li>• Keep this page open</li>
              <li>• Your family sees you on live map</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
