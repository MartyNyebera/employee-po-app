// Environment configuration for different deployment scenarios
export const ENVIRONMENT = {
  // Development (localhost)
  development: {
    API_URL: 'http://localhost:3001',
    TRACCAR_URL: 'http://localhost:8082',
    APP_URL: 'http://localhost:3000',
    WS_URL: 'ws://localhost:3001',
  },
  
  // Production (real domain)
  production: {
    API_URL: 'https://api.yourdomain.com',
    TRACCAR_URL: 'https://gps.yourdomain.com',
    APP_URL: 'https://app.yourdomain.com',
    WS_URL: 'wss://api.yourdomain.com',
  },
  
  // Staging (testing)
  staging: {
    API_URL: 'https://staging-api.yourdomain.com',
    TRACCAR_URL: 'https://staging-gps.yourdomain.com',
    APP_URL: 'https://staging.yourdomain.com',
    WS_URL: 'wss://staging-api.yourdomain.com',
  },
  
  // Local network (for testing on other devices)
  localNetwork: {
    API_URL: 'http://192.168.1.100:3001',
    TRACCAR_URL: 'http://192.168.1.100:8082',
    APP_URL: 'http://192.168.1.100:3000',
    WS_URL: 'ws://192.168.1.100:3001',
  }
};

// Auto-detect environment
export function getEnvironment() {
  const hostname = window.location.hostname;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return ENVIRONMENT.development;
  } else if (hostname.includes('staging')) {
    return ENVIRONMENT.staging;
  } else if (hostname.includes('192.168')) {
    return ENVIRONMENT.development; // Use localhost config even on local network
  } else {
    return ENVIRONMENT.production;
  }
}

// Export current environment config
export const CONFIG = getEnvironment();

// Helper to get current base URL
export function getBaseUrl() {
  return window.location.origin;
}

// Helper to check if we're in development
export function isDevelopment() {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

// Helper to check if we're in production
export function isProduction() {
  return !isDevelopment() && !window.location.hostname.includes('staging') && !window.location.hostname.includes('192.168');
}
