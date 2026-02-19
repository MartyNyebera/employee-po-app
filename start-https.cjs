const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Generate self-signed certificate for HTTPS
const { execSync } = require('child_process');

console.log('🔧 Setting up HTTPS for GPS access...');

try {
  // Generate self-signed certificate
  execSync('openssl req -x509 -newkey rsa:2048 -keyout server.key -out server.crt -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"', { stdio: 'inherit' });
  console.log('✅ Self-signed certificate generated');
} catch (error) {
  console.log('⚠️ Certificate generation failed, trying to continue...');
}

// Read certificate files
let key, cert;
try {
  key = fs.readFileSync('server.key');
  cert = fs.readFileSync('server.crt');
  console.log('✅ Certificate files loaded');
} catch (error) {
  console.log('❌ Certificate files not found');
  process.exit(1);
}

// Create HTTPS server
const options = { key, cert };

const server = https.createServer(options, (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Serve files from public directory
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'phone-gps.html' : req.url);
  
  // Remove query parameters
  filePath = filePath.split('?')[0];

  // Security check
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('File not found');
      return;
    }

    // Set content type based on file extension
    const ext = path.extname(filePath);
    const contentType = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml'
    }[ext] || 'text/plain';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

const PORT = 8443;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ HTTPS server running on https://192.168.254.108:${PORT}`);
  console.log(`📱 Phone GPS: https://192.168.254.108:${PORT}/phone-gps.html`);
  console.log(`🔒 Note: You'll see a security warning - click "Advanced" → "Proceed to 192.168.254.108"`);
  console.log(`🎯 This will allow automatic GPS to work!`);
});

// Handle server shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down HTTPS server...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
