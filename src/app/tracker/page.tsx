'use client';

import { useEffect, useState } from 'react';
import { gpsService, GPSLocation } from '../../services/gpsService';

export default function TrackerPage() {
  const [isTracking, setIsTracking] = useState(false);
  const [location, setLocation] = useState<GPSLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vehicleId] = useState('vehicle-001'); // Default vehicle ID

  const sendLocation = async (position: GeolocationPosition) => {
    const locationData: GPSLocation = {
      vehicleId,
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      speed: position.coords.speed ? position.coords.speed * 3.6 : null, // Convert m/s to km/h
      heading: position.coords.heading,
      timestamp: Date.now()
    };

    try {
      // Send to GPS service
      const result = await gpsService.saveLocation(locationData);
      
      if (result.success) {
        setLocation(locationData);
        setError(null);
        console.log('Location sent successfully:', locationData);
      } else {
        throw new Error(result.message);
      }
    } catch (err) {
      console.error('Error sending location:', err);
      setError('Failed to send location');
    }
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser');
      return;
    }

    setIsTracking(true);
    setError(null);

    const watchId = navigator.geolocation.watchPosition(
      sendLocation,
      (error) => {
        console.error('Geolocation error:', error);
        setError(`Geolocation error: ${error.message}`);
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
      (error) => {
        console.error('Initial location error:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );

    // Store watchId for cleanup
    (window as any).locationWatchId = watchId;
  };

  const stopTracking = () => {
    if ((window as any).locationWatchId) {
      navigator.geolocation.clearWatch((window as any).locationWatchId);
      delete (window as any).locationWatchId;
    }
    setIsTracking(false);
  };

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if ((window as any).locationWatchId) {
        navigator.geolocation.clearWatch((window as any).locationWatchId);
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
              🚗 Vehicle Tracker
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Mobile GPS tracking for vehicle {vehicleId}
            </p>
          </div>

          {/* Status Card */}
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 dark:bg-slate-800">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Status
              </h2>
              <div className={`w-3 h-3 rounded-full ${
                isTracking ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
              }`} />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Tracking:</span>
                <span className={`font-semibold ${
                  isTracking ? 'text-green-600' : 'text-gray-500'
                }`}>
                  {isTracking ? 'Active' : 'Inactive'}
                </span>
              </div>

              {location && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Latitude:</span>
                    <span className="font-mono text-sm">
                      {location.lat.toFixed(6)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Longitude:</span>
                    <span className="font-mono text-sm">
                      {location.lng.toFixed(6)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Speed:</span>
                    <span className="font-mono text-sm">
                      {location.speed ? `${location.speed.toFixed(1)} km/h` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Heading:</span>
                    <span className="font-mono text-sm">
                      {location.heading ? `${location.heading.toFixed(0)}°` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Last Update:</span>
                    <span className="font-mono text-sm">
                      {new Date(location.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </>
              )}
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/20 dark:border-red-800">
                <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="bg-white rounded-2xl shadow-xl p-6 dark:bg-slate-800">
            <div className="space-y-4">
              {!isTracking ? (
                <button
                  onClick={startTracking}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-xl transition-colors duration-200 flex items-center justify-center gap-2"
                >
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Start Tracking
                </button>
              ) : (
                <button
                  onClick={stopTracking}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-4 px-6 rounded-xl transition-colors duration-200 flex items-center justify-center gap-2"
                >
                  <div className="w-5 h-5 bg-white rounded-sm" />
                  Stop Tracking
                </button>
              )}

              <div className="text-center text-sm text-slate-500 dark:text-slate-400">
                <p>Location updates every 2 seconds</p>
                <p>High accuracy mode enabled</p>
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
            <p>Keep this page open to track vehicle movement</p>
            <p>View live map on dashboard</p>
          </div>
        </div>
      </div>
    </div>
  );
}
