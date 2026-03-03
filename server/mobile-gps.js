// Mobile GPS API - Decoupled from Vehicle Database
// Handles GPS pings from mobile app directly

import express from 'express';
const router = express.Router();

// Store mobile GPS data in memory (can be replaced with Redis/DB later)
const mobileGPSData = new Map();

// POST /api/mobile/gps - Accept GPS data from mobile app
router.post('/gps', (req, res) => {
  try {
    const {
      deviceId,
      lat,
      lng,
      accuracy,
      speed,
      heading,
      timestamp
    } = req.body;

    // Validate required fields
    if (!deviceId || !lat || !lng) {
      return res.status(400).json({
        error: 'Missing required fields: deviceId, lat, lng'
      });
    }

    // Validate coordinates
    if (typeof lat !== 'number' || typeof lng !== 'number' ||
        lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({
        error: 'Invalid coordinates'
      });
    }

    // Store GPS data
    const gpsData = {
      deviceId,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      accuracy: accuracy ? parseFloat(accuracy) : null,
      speed: speed ? parseFloat(speed) : null,
      heading: heading ? parseFloat(heading) : null,
      timestamp: timestamp || Date.now(),
      receivedAt: Date.now()
    };

    mobileGPSData.set(deviceId, gpsData);

    console.log(`[MobileGPS] Received GPS from ${deviceId}:`, {
      lat: gpsData.lat,
      lng: gpsData.lng,
      speed: gpsData.speed,
      timestamp: new Date(gpsData.timestamp).toISOString()
    });

    // Broadcast to connected clients (if WebSocket is available)
    if (req.app.locals.broadcastGPS) {
      req.app.locals.broadcastGPS(gpsData);
    }

    res.json({
      success: true,
      message: 'GPS data received',
      deviceId,
      timestamp: gpsData.timestamp
    });

  } catch (error) {
    console.error('[MobileGPS] Error processing GPS data:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// GET /api/mobile/gps/:deviceId - Get latest GPS data for specific device
router.get('/gps/:deviceId', (req, res) => {
  try {
    const { deviceId } = req.params;
    const gpsData = mobileGPSData.get(deviceId);

    if (!gpsData) {
      return res.status(404).json({
        error: 'Device not found'
      });
    }

    // Check if data is stale (older than 5 minutes)
    const age = Date.now() - gpsData.timestamp;
    if (age > 300000) { // 5 minutes
      return res.status(404).json({
        error: 'GPS data too old'
      });
    }

    res.json(gpsData);

  } catch (error) {
    console.error('[MobileGPS] Error fetching GPS data:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// GET /api/mobile/gps - Get all active devices
router.get('/gps', (req, res) => {
  try {
    const now = Date.now();
    const activeDevices = [];

    for (const [deviceId, gpsData] of mobileGPSData.entries()) {
      const age = now - gpsData.timestamp;
      
      // Only include devices with recent data (within 5 minutes)
      if (age < 300000) { // 5 minutes
        const status = age < 60000 ? 'Moving' : // Less than 1 minute
                       (gpsData.speed && gpsData.speed > 5) ? 'Moving' : 
                       'Idle';

        activeDevices.push({
          ...gpsData,
          status,
          age: Math.floor(age / 1000) // Age in seconds
        });
      }
    }

    res.json({
      devices: activeDevices,
      count: activeDevices.length,
      timestamp: now
    });

  } catch (error) {
    console.error('[MobileGPS] Error fetching devices:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// DELETE /api/mobile/gps/:deviceId - Remove device data
router.delete('/gps/:deviceId', (req, res) => {
  try {
    const { deviceId } = req.params;
    const deleted = mobileGPSData.delete(deviceId);

    if (deleted) {
      console.log(`[MobileGPS] Removed device: ${deviceId}`);
      res.json({
        success: true,
        message: 'Device removed'
      });
    } else {
      res.status(404).json({
        error: 'Device not found'
      });
    }

  } catch (error) {
    console.error('[MobileGPS] Error removing device:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// GET /api/mobile/status - Get system status
router.get('/status', (req, res) => {
  try {
    const now = Date.now();
    const activeCount = Array.from(mobileGPSData.values())
      .filter(data => (now - data.timestamp) < 300000).length;

    res.json({
      system: 'Mobile GPS Tracking',
      status: 'active',
      activeDevices: activeCount,
      totalDevices: mobileGPSData.size,
      timestamp: now,
      uptime: process.uptime()
    });

  } catch (error) {
    console.error('[MobileGPS] Error getting status:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Cleanup old data periodically (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  const cutoff = now - 3600000; // 1 hour ago
  
  for (const [deviceId, gpsData] of mobileGPSData.entries()) {
    if (gpsData.timestamp < cutoff) {
      mobileGPSData.delete(deviceId);
      console.log(`[MobileGPS] Cleaned up old device: ${deviceId}`);
    }
  }
}, 600000); // 10 minutes

export default router;
