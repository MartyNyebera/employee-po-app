const https = require('https');
const fs = require('fs');
const path = require('path');

// Simple HTTPS server for GPS testing
const options = {
  key: fs.readFileSync(path.join(__dirname, 'server.key')),
  cert: fs.readFileSync(path.join(__dirname, 'server.crt'))
};

// Create a simple HTTPS server that proxies to your main app
const server = https.createServer(options, (req, res) => {
  // Redirect HTTP requests to HTTPS
  if (req.headers['x-forwarded-proto'] !== 'https') {
    res.writeHead(301, { 'Location': `https://${req.headers.host}${req.url}` });
    res.end();
    return;
  }

  // Serve the phone-gps.html file
  if (req.url === '/phone-gps.html') {
    const filePath = path.join(__dirname, 'public', 'phone-gps.html');
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('File not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
    return;
  }

  // For other requests, redirect to main app
  res.writeHead(302, { 'Location': `https://192.168.254.108:3000${req.url}` });
  res.end();
});

server.listen(3443, '0.0.0.0', () => {
  console.log('HTTPS server running on https://192.168.254.108:3443');
  console.log('Phone GPS: https://192.168.254.108:3443/phone-gps.html');
});
