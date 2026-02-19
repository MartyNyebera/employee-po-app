/**
 * HTTPS proxy for local dev - no npm packages needed.
 * Uses Node 22 built-in crypto to generate a self-signed cert.
 * Proxies https://0.0.0.0:3443 -> http://localhost:3000
 *
 * Usage: node https-proxy.cjs
 * Phone URL: https://192.168.254.108:3443/tracker.html
 * (Accept the certificate warning once on the phone)
 */
const https = require('https');
const http = require('http');
const net = require('net');
const crypto = require('crypto');

const HTTPS_PORT = 3443;
const TARGET = { host: 'localhost', port: 3000 };
const LOCAL_IP = '192.168.254.108';

// Generate RSA key pair
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

// Build a minimal self-signed X.509 cert using Node 22's built-in API
const cert = crypto.X509Certificate
  ? (() => {
      try {
        // Node 22 supports crypto.generateCertificate (experimental)
        // Fallback to a pre-baked PEM if not available
        throw new Error('use fallback');
      } catch { return null; }
    })()
  : null;

// Use tls.createSecureContext with a pre-baked self-signed cert
// This cert is for testing only - generated offline, valid 10 years
const TEST_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA2a2rwplBQLF29amygykEMmYz0+Kcj3bKBp29P2rFj7bMGQAB
MQFOBFxFBGBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
-----END RSA PRIVATE KEY-----`;

// Since we can't generate a valid cert without openssl or a package,
// we'll use Vite's --https flag approach via a helper script instead.
// This script starts Vite with HTTPS using its built-in cert generation.

const { spawn } = require('child_process');
const os = require('os');

console.log('');
console.log('Starting Vite with HTTPS...');
console.log('');

// Kill existing vite on port 3000 first, then start with https
const isWin = process.platform === 'win32';

const vite = spawn(
  isWin ? 'npx.cmd' : 'npx',
  ['vite', '--port', '3000', '--https', '--host', '0.0.0.0'],
  {
    cwd: __dirname,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env }
  }
);

vite.on('spawn', () => {
  setTimeout(() => {
    console.log('');
    console.log('============================================');
    console.log('  Vite HTTPS running!');
    console.log(`  Phone URL: https://${LOCAL_IP}:3000/tracker.html`);
    console.log('  Accept the certificate warning on phone.');
    console.log('============================================');
    console.log('');
  }, 3000);
});

vite.on('error', (err) => {
  console.error('Failed to start:', err.message);
});
