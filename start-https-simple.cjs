const https = require('https');
const fs = require('fs');
const path = require('path');

// Create a simple self-signed certificate (Node.js compatible)
const crypto = require('crypto');

function generateSelfSignedCert() {
    const key = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
        }
    });

    // Create a simple self-signed certificate
    const cert = crypto.createCertificate({
        publicKey: key.publicKey,
        privateKey: key.privateKey,
        issuer: { CN: 'localhost' },
        subject: { CN: 'localhost' },
        notBefore: new Date(),
        notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        extensions: [
            {
                name: 'subjectAltName',
                altNames: [
                    { type: 'DNS', value: 'localhost' },
                    { type: 'DNS', value: '192.168.254.108' }
                ]
            }
        ]
    });

    return {
        key: key.privateKey,
        cert: cert.toString()
    };
}

console.log('🔧 Setting up HTTPS for GPS access...');

let key, cert;
try {
    const certData = generateSelfSignedCert();
    key = certData.key;
    cert = certData.cert;
    
    // Save certificate files
    fs.writeFileSync('server.key', key);
    fs.writeFileSync('server.crt', cert);
    console.log('✅ Self-signed certificate generated');
} catch (error) {
    console.log('❌ Certificate generation failed:', error.message);
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
    let filePath = path.join(__dirname, 'public', req.url === '/' ? 'auto-gps.html' : req.url);
    
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
    console.log(`📱 Phone GPS: https://192.168.254.108:${PORT}/auto-gps.html`);
    console.log(`🔒 Note: You'll see a security warning - click "Advanced" → "Proceed to 192.168.254.108 (unsafe)"`);
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
