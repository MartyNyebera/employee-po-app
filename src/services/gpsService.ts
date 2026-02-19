// GPS Service for vehicle tracking
// This handles GPS data storage and retrieval

export interface GPSLocation {
  vehicleId: string;
  lat: number;
  lng: number;
  speed: number | null;
  heading: number | null;
  timestamp: number;
}

export interface VehicleStatus {
  vehicleId: string;
  status: 'Moving' | 'Idle' | 'Offline';
  speed: number;
  lastUpdated: string;
  lat: number;
  lng: number;
}

class GPSService {
  private locations: Map<string, GPSLocation> = new Map();
  private subscribers: Set<(locations: Map<string, GPSLocation>) => void> = new Set();

  constructor() {
    // Listen for GPS data from localStorage (HTML sender)
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e: StorageEvent) => {
        if (e.key && e.key.startsWith('gpsData_') && e.newValue) {
          try {
            const gpsData = JSON.parse(e.newValue);
            this.saveLocation(gpsData);
          } catch (err) {
            console.error('Error parsing GPS data from localStorage:', err);
          }
        }
      });

      // Check for existing GPS data on startup
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('gpsData_')) {
          try {
            const gpsData = JSON.parse(localStorage.getItem(key) || '{}');
            this.saveLocation(gpsData);
          } catch (err) {
            console.error('Error parsing existing GPS data:', err);
          }
        }
      }
    }
  }

  // Store GPS location
  async saveLocation(location: GPSLocation): Promise<{ success: boolean; message: string }> {
    try {
      // Validate coordinates
      if (location.lat < -90 || location.lat > 90 || location.lng < -180 || location.lng > 180) {
        throw new Error('Invalid coordinates');
      }

      // Store with server timestamp
      this.locations.set(location.vehicleId, {
        ...location,
        timestamp: Date.now()
      });

      // Notify subscribers
      this.notifySubscribers();

      console.log('GPS location saved:', location);
      return { success: true, message: 'Location saved successfully' };
    } catch (error) {
      console.error('Error saving location:', error);
      return { success: false, message: 'Failed to save location' };
    }
  }

  // Get latest location for vehicle
  async getLatestLocation(vehicleId: string): Promise<GPSLocation | null> {
    const location = this.locations.get(vehicleId);
    
    if (!location) {
      return null;
    }

    // Check if location is too old (offline)
    const now = Date.now();
    const age = now - location.timestamp;
    
    if (age > 30000) { // 30 seconds
      return null; // Vehicle is offline
    }

    return location;
  }

  // Get all vehicles with status
  async getAllVehicles(): Promise<VehicleStatus[]> {
    const vehicles: VehicleStatus[] = [];
    const now = Date.now();

    this.locations.forEach((location, vehicleId) => {
      const age = now - location.timestamp;
      let status: 'Moving' | 'Idle' | 'Offline';
      
      if (age > 30000) { // 30 seconds
        status = 'Offline';
      } else if (location.speed && location.speed > 2) {
        status = 'Moving';
      } else {
        status = 'Idle';
      }

      vehicles.push({
        vehicleId,
        status,
        speed: location.speed || 0,
        lastUpdated: new Date(location.timestamp).toLocaleTimeString(),
        lat: location.lat,
        lng: location.lng
      });
    });

    return vehicles;
  }

  // Subscribe to location updates
  subscribe(callback: (locations: Map<string, GPSLocation>) => void) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  // Notify all subscribers
  private notifySubscribers() {
    this.subscribers.forEach(callback => callback(this.locations));
  }

  // Remove vehicle
  async removeVehicle(vehicleId: string): Promise<{ success: boolean; message: string }> {
    const deleted = this.locations.delete(vehicleId);
    this.notifySubscribers();
    
    if (deleted) {
      return { success: true, message: 'Vehicle removed successfully' };
    } else {
      return { success: false, message: 'Vehicle not found' };
    }
  }

  // Get all locations (for debugging)
  getAllLocations(): Map<string, GPSLocation> {
    return this.locations;
  }
}

// Export singleton instance
export const gpsService = new GPSService();

// HTTP API methods for external clients
export const gpsAPI = {
  // Handle POST requests from HTML sender
  async handlePostRequest(data: any): Promise<{ success: boolean; message: string }> {
    try {
      const { vehicleId, lat, lng, speed, heading, timestamp } = data;
      
      if (!vehicleId || lat === undefined || lng === undefined) {
        return { success: false, message: 'Missing required fields: vehicleId, lat, lng' };
      }

      if (typeof lat !== 'number' || typeof lng !== 'number' ||
          lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return { success: false, message: 'Invalid coordinates' };
      }

      return await gpsService.saveLocation({
        vehicleId,
        lat,
        lng,
        speed: speed || null,
        heading: heading || null,
        timestamp: timestamp || Date.now()
      });
    } catch (error) {
      console.error('GPS API error:', error);
      return { success: false, message: 'Internal server error' };
    }
  }
};
