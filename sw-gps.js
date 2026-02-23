// GPS Service Worker - Keeps tracking alive in background
const API_BASE = 'https://employee-po-app.onrender.com';
let lastPosition = null;
let trackingInterval = null;

// Listen for messages from main page
self.addEventListener('message', (event) => {
  if (event.data.type === 'START_TRACKING') {
    startBackgroundTracking(event.data.deviceId);
  } else if (event.data.type === 'STOP_TRACKING') {
    stopBackgroundTracking();
  } else if (event.data.type === 'UPDATE_POSITION') {
    lastPosition = event.data.position;
  }
});

function startBackgroundTracking(deviceId = 'phone-1') {
  console.log('Background GPS tracking started');
  
  // Use periodic position checks (service workers have limited GPS access)
  trackingInterval = setInterval(() => {
    if (lastPosition) {
      sendLocation(lastPosition, deviceId);
    }
  }, 2000);
}

function stopBackgroundTracking() {
  console.log('Background GPS tracking stopped');
  if (trackingInterval) {
    clearInterval(trackingInterval);
    trackingInterval = null;
  }
}

async function sendLocation(pos, deviceId) {
  try {
    const data = {
      deviceId,
      lat: pos.lat,
      lng: pos.lng,
      accuracy: pos.accuracy || null,
      speed: pos.speed || null,
      heading: pos.heading || null,
      timestamp: Date.now()
    };

    await fetch(API_BASE + '/api/phone-location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    console.log('Background GPS sent successfully');
  } catch (error) {
    console.error('Background GPS send failed:', error);
  }
}

// Keep service worker alive
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
