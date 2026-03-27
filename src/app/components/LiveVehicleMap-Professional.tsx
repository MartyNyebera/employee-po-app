import { useEffect, useState, useRef } from 'react';
import { MapPin, AlertCircle, Navigation, Gauge, RefreshCw, Wifi, WifiOff, Users, Route } from 'lucide-react';

// Define types locally instead of importing from Traccar
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

export function LiveVehicleMap() {
  const [devices, setDevices] = useState<DeviceWithPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Real GPS tracking from server API
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const fetchDriverLocations = async () => {
      try {
        // Add timeout to prevent infinite loading
        timeoutId = setTimeout(() => {
          setLoading(false);
          setError('GPS data loading timeout. Please refresh.');
        }, 10000);

        const response = await fetch('/api/driver/locations/live');
        
        if (!response.ok) {
          throw new Error(`Failed to fetch GPS data: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        if (Array.isArray(data)) {
          // Transform data to match DeviceWithPosition interface
          const transformedDevices: DeviceWithPosition[] = data.map(device => ({
            id: device.id || 0,
            name: device.name || device.full_name || 'Unknown Vehicle',
            uniqueId: device.uniqueId || device.driver_id || 'unknown',
            status: device.status || 'offline',
            lastUpdate: device.lastUpdate || device.last_seen || null,
            positionId: device.positionId || null,
            category: device.category || 'vehicle',
            position: device.position ? {
              id: device.position.id || 0,
              deviceId: device.position.deviceId || device.id || 0,
              latitude: device.position.latitude || 0,
              longitude: device.position.longitude || 0,
              speed: device.position.speed || 0,
              course: device.position.course || 0,
              altitude: device.position.altitude || 0,
              accuracy: device.position.accuracy || 0,
              fixTime: device.position.fixTime || new Date().toISOString(),
              deviceTime: device.position.deviceTime || new Date().toISOString(),
              serverTime: device.position.serverTime || new Date().toISOString(),
              attributes: device.position.attributes || {}
            } : undefined
          }));
          
          setDevices(transformedDevices);
          setError(null);
        } else {
          throw new Error('Invalid GPS data format received');
        }
      } catch (err: any) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        console.error('GPS fetch error:', err);
        setError(err.message || 'Failed to load GPS data');
        setDevices([]);
      } finally {
        setLoading(false);
        setLastUpdated(new Date());
      }
    };

    fetchDriverLocations();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchDriverLocations, 30000);
    
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      clearInterval(interval);
    };
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch('/api/driver/locations/live');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          const transformedDevices: DeviceWithPosition[] = data.map(device => ({
            id: device.id || 0,
            name: device.name || device.full_name || 'Unknown Vehicle',
            uniqueId: device.uniqueId || device.driver_id || 'unknown',
            status: device.status || 'offline',
            lastUpdate: device.lastUpdate || device.last_seen || null,
            positionId: device.positionId || null,
            category: device.category || 'vehicle',
            position: device.position ? {
              id: device.position.id || 0,
              deviceId: device.position.deviceId || device.id || 0,
              latitude: device.position.latitude || 0,
              longitude: device.position.longitude || 0,
              speed: device.position.speed || 0,
              course: device.position.course || 0,
              altitude: device.position.altitude || 0,
              accuracy: device.position.accuracy || 0,
              fixTime: device.position.fixTime || new Date().toISOString(),
              deviceTime: device.position.deviceTime || new Date().toISOString(),
              serverTime: device.position.serverTime || new Date().toISOString(),
              attributes: device.position.attributes || {}
            } : undefined
          }));
          setDevices(transformedDevices);
          setError(null);
        }
      }
    } catch (err: any) {
      console.error('Refresh error:', err);
      setError('Failed to refresh GPS data');
    } finally {
      setIsRefreshing(false);
      setLastUpdated(new Date());
    }
  };

  const onlineDevices = devices.filter(d => d.status === 'online' || d.status === 'active');
  const movingDevices = devices.filter(d => d.position && d.position.speed > 0);
  const offlineDevices = devices.filter(d => d.status === 'offline' || d.status === 'inactive');

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          border: '4px solid #e5e7eb',
          borderTopColor: '#3b82f6',
          animation: 'spin 1s linear infinite'
        }} />
        <div style={{
          fontSize: '16px',
          fontWeight: '500',
          color: '#6b7280',
          fontFamily: 'Inter, sans-serif'
        }}>
          Loading GPS tracking data...
        </div>
      </div>
    );
  }

  return (
    <div style={{
      padding: '32px',
      fontFamily: 'Inter, sans-serif',
      backgroundColor: '#ffffff',
      minHeight: '100vh'
    }}>
      {/* HEADER */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '32px'
      }}>
        <div>
          <h1 style={{
            fontSize: '28px',
            fontWeight: '700',
            color: '#111827',
            margin: '0 0 8px 0',
            fontFamily: 'Plus Jakarta Sans, Inter, sans-serif'
          }}>
            GPS Tracking
          </h1>
          <p style={{
            fontSize: '14px',
            color: '#6b7280',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            Real-time vehicle location tracking
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          style={{
            backgroundColor: '#3b82f6',
            color: 'white',
            padding: '12px 20px',
            borderRadius: '8px',
            border: 'none',
            fontSize: '14px',
            fontWeight: '500',
            fontFamily: 'Inter, sans-serif',
            cursor: isRefreshing ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
            opacity: isRefreshing ? 0.6 : 1
          }}
          onMouseOver={(e) => {
            if (!isRefreshing) {
              e.currentTarget.style.backgroundColor = '#2563eb';
            }
          }}
          onMouseOut={(e) => {
            if (!isRefreshing) {
              e.currentTarget.style.backgroundColor = '#3b82f6';
            }
          }}
        >
          <RefreshCw 
            style={{ 
              width: '16px', 
              height: '16px',
              animation: isRefreshing ? 'spin 1s linear infinite' : 'none'
            }} 
          />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* METRIC CARDS */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '20px',
        marginBottom: '32px'
      }}>
        <div style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          transition: 'all 0.2s ease'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: '#dbeafe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Users style={{ width: '24px', height: '24px', color: '#3b82f6' }} />
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#111827',
            margin: '0 0 8px 0',
            fontFamily: 'Plus Jakarta Sans, Inter, monospace'
          }}>
            {devices.length}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#6b7280',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            Total Vehicles
          </p>
        </div>

        <div style={{
          background: '#ffffff',
          border: '1px solid #bbf7d0',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          transition: 'all 0.2s ease'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: '#f0fdf4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Wifi style={{ width: '24px', height: '24px', color: '#059669' }} />
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '600',
              color: '#059669',
              backgroundColor: '#f0fdf4',
              fontFamily: 'Inter, sans-serif'
            }}>
              <Wifi style={{ width: '16px', height: '16px' }} />
              Online
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#059669',
            margin: '0 0 8px 0',
            fontFamily: 'Plus Jakarta Sans, Inter, monospace'
          }}>
            {onlineDevices.length}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#065f46',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            Online Now
          </p>
        </div>

        <div style={{
          background: '#ffffff',
          border: '1px solid #ddd6fe',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          transition: 'all 0.2s ease'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: '#f5f3ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Route style={{ width: '24px', height: '24px', color: '#7c3aed' }} />
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '600',
              color: '#7c3aed',
              backgroundColor: '#f5f3ff',
              fontFamily: 'Inter, sans-serif'
            }}>
              <Navigation style={{ width: '16px', height: '16px' }} />
              Moving
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#7c3aed',
            margin: '0 0 8px 0',
            fontFamily: 'Plus Jakarta Sans, Inter, monospace'
          }}>
            {movingDevices.length}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#4c1d95',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            In Transit
          </p>
        </div>

        <div style={{
          background: '#ffffff',
          border: '1px solid #fecaca',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          transition: 'all 0.2s ease'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: '#fef2f2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <WifiOff style={{ width: '24px', height: '24px', color: '#dc2626' }} />
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '600',
              color: '#dc2626',
              backgroundColor: '#fef2f2',
              fontFamily: 'Inter, sans-serif'
            }}>
              <WifiOff style={{ width: '16px', height: '16px' }} />
              Offline
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#dc2626',
            margin: '0 0 8px 0',
            fontFamily: 'Plus Jakarta Sans, Inter, monospace'
          }}>
            {offlineDevices.length}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#7f1d1d',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            Offline
          </p>
        </div>
      </div>

      {/* ERROR STATE */}
      {error && (
        <div style={{
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '32px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}>
          <AlertCircle style={{ width: '24px', height: '24px', color: '#dc2626' }} />
          <div>
            <h3 style={{
              fontSize: '16px',
              fontWeight: '600',
              color: '#dc2626',
              margin: '0 0 4px 0',
              fontFamily: 'Inter, sans-serif'
            }}>
              GPS Tracking Error
            </h3>
            <p style={{
              fontSize: '14px',
              color: '#7f1d1d',
              margin: '0',
              fontFamily: 'Inter, sans-serif'
            }}>
              {error}
            </p>
          </div>
        </div>
      )}

      {/* MAP CONTAINER */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        marginBottom: '32px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px'
        }}>
          <h2 style={{
            fontSize: '20px',
            fontWeight: '600',
            color: '#111827',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            Live Map View
          </h2>
          <div style={{
            fontSize: '12px',
            color: '#6b7280',
            fontFamily: 'Inter, sans-serif'
          }}>
            Last updated: {lastUpdated.toLocaleTimeString()}
          </div>
        </div>
        
        <div 
          ref={mapRef}
          style={{
            height: '400px',
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative'
          }}
        >
          <div style={{
            textAlign: 'center',
            color: '#6b7280'
          }}>
            <MapPin style={{ 
              width: '48px', 
              height: '48px', 
              color: '#d1d5db',
              marginBottom: '16px',
              margin: '0 auto 16px'
            }} />
            <h3 style={{
              fontSize: '18px',
              fontWeight: '600',
              color: '#374151',
              margin: '0 0 8px 0',
              fontFamily: 'Inter, sans-serif'
            }}>
              Map View
            </h3>
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              margin: '0',
              fontFamily: 'Inter, sans-serif'
            }}>
              Interactive map will be displayed here
            </p>
            <p style={{
              fontSize: '12px',
              color: '#9ca3af',
              margin: '8px 0 0 0',
              fontFamily: 'Inter, sans-serif'
            }}>
              {devices.length} vehicles tracked
            </p>
          </div>
        </div>
      </div>

      {/* VEHICLE LIST */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
      }}>
        <h2 style={{
          fontSize: '20px',
          fontWeight: '600',
          color: '#111827',
          margin: '0 0 20px 0',
          fontFamily: 'Inter, sans-serif'
        }}>
          Vehicle Status
        </h2>
        
        {devices.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '48px',
            color: '#6b7280'
          }}>
            <Users style={{ 
              width: '64px', 
              height: '64px', 
              color: '#d1d5db',
              marginBottom: '16px',
              margin: '0 auto 16px'
            }} />
            <h3 style={{
              fontSize: '18px',
              fontWeight: '600',
              color: '#374151',
              margin: '0 0 8px 0',
              fontFamily: 'Inter, sans-serif'
            }}>
              No Vehicles Found
            </h3>
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              margin: '0',
              fontFamily: 'Inter, sans-serif'
            }}>
              No GPS data available for any vehicles.
            </p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gap: '16px'
          }}>
            {devices.map(device => (
              <div
                key={device.id}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  padding: '20px',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '20px'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    flex: 1
                  }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      backgroundColor: device.status === 'online' ? '#f0fdf4' : '#fef2f2',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {device.status === 'online' ? (
                        <Wifi style={{ width: '20px', height: '20px', color: '#059669' }} />
                      ) : (
                        <WifiOff style={{ width: '20px', height: '20px', color: '#dc2626' }} />
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <h3 style={{
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#111827',
                        margin: '0 0 4px 0',
                        fontFamily: 'Inter, sans-serif'
                      }}>
                        {device.name}
                      </h3>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        fontSize: '13px',
                        color: '#6b7280',
                        fontFamily: 'Inter, sans-serif'
                      }}>
                        <span style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <MapPin style={{ width: '14px', height: '14px' }} />
                          {device.status === 'online' ? 'Online' : 'Offline'}
                        </span>
                        {device.position && (
                          <span style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <Gauge style={{ width: '14px', height: '14px' }} />
                            {Math.round(device.position.speed)} km/h
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div style={{
                    fontSize: '12px',
                    color: '#9ca3af',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    {device.lastUpdate ? 
                      new Date(device.lastUpdate).toLocaleString() : 
                      'No data'
                    }
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
