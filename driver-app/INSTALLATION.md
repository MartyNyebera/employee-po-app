<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kimoel Driver App - Download</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%);
            min-height: 100vh;
            color: white;
        }
        .container {
            max-width: 400px;
            margin: 0 auto;
            padding: 20px;
            text-align: center;
        }
        .logo {
            font-size: 48px;
            margin-bottom: 20px;
        }
        .title {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .subtitle {
            font-size: 16px;
            color: #94a3b8;
            margin-bottom: 30px;
        }
        .qr-container {
            background: white;
            border-radius: 20px;
            padding: 30px;
            margin-bottom: 20px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        }
        .qr-title {
            color: #1e293b;
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 15px;
        }
        .qr-image {
            width: 200px;
            height: 200px;
            margin: 15px auto;
            background: #f8fafc;
            border: 2px solid #e2e8f0;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            color: #64748b;
        }
        .instructions {
            color: #475569;
            font-size: 14px;
            line-height: 1.5;
            margin-top: 15px;
        }
        .download-buttons {
            margin-top: 20px;
        }
        .download-btn {
            display: block;
            width: 100%;
            padding: 15px;
            margin: 10px 0;
            background: #2563eb;
            color: white;
            text-decoration: none;
            border-radius: 10px;
            font-weight: 600;
            border: none;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        .download-btn:hover {
            background: #1d4ed8;
            transform: translateY(-2px);
        }
        .download-btn.secondary {
            background: #10b981;
        }
        .download-btn.secondary:hover {
            background: #059669;
        }
        .features {
            background: rgba(255,255,255,0.1);
            border-radius: 15px;
            padding: 20px;
            margin-top: 20px;
            backdrop-filter: blur(10px);
        }
        .feature {
            display: flex;
            align-items: center;
            margin: 10px 0;
            font-size: 14px;
        }
        .feature-icon {
            margin-right: 10px;
            color: #10b981;
        }
        .footer {
            margin-top: 30px;
            font-size: 12px;
            color: #64748b;
        }
        .platform-badge {
            display: inline-block;
            padding: 4px 8px;
            background: rgba(255,255,255,0.2);
            border-radius: 4px;
            font-size: 12px;
            margin: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Logo and Title -->
        <div class="logo">🚗</div>
        <div class="title">Kimoel Driver App</div>
        <div class="subtitle">Professional Delivery Tracking</div>

        <!-- Main QR Code -->
        <div class="qr-container">
            <div class="qr-title">📱 Scan to Install</div>
            <div class="qr-image">
                <!-- Replace with actual QR code image -->
                QR Code Here
            </div>
            <div class="instructions">
                1. Open your phone camera<br>
                2. Scan this QR code<br>
                3. Tap the download link<br>
                4. Install and login
            </div>
        </div>

        <!-- Download Buttons -->
        <div class="download-buttons">
            <a href="#" class="download-btn" id="androidBtn">
                🤖 Download for Android
            </a>
            <a href="#" class="download-btn secondary" id="iosBtn">
                🍎 Download for iPhone
            </a>
        </div>

        <!-- Platform Detection -->
        <div id="platformInfo">
            <span class="platform-badge">Detecting your device...</span>
        </div>

        <!-- Features -->
        <div class="features">
            <div class="feature">
                <span class="feature-icon">✅</span>
                <span>GPS tracking during work hours</span>
            </div>
            <div class="feature">
                <span class="feature-icon">✅</span>
                <span>Real-time delivery updates</span>
            </div>
            <div class="feature">
                <span class="feature-icon">✅</span>
                <span>Offline data sync</span>
            </div>
            <div class="feature">
                <span class="feature-icon">✅</span>
                <span>Secure authentication</span>
            </div>
        </div>

        <!-- Footer -->
        <div class="footer">
            <p>Need help? Contact support@kimoel.com</p>
            <p>© 2026 Kimoel Delivery Systems</p>
        </div>
    </div>

    <script>
        // Detect user's platform
        function detectPlatform() {
            const userAgent = navigator.userAgent.toLowerCase();
            const platformInfo = document.getElementById('platformInfo');
            const androidBtn = document.getElementById('androidBtn');
            const iosBtn = document.getElementById('iosBtn');

            if (userAgent.includes('android')) {
                platformInfo.innerHTML = '<span class="platform-badge">🤖 Android Detected</span>';
                androidBtn.style.display = 'block';
                iosBtn.style.display = 'none';
                androidBtn.href = 'https://your-server.com/kimoel-driver.apk';
            } else if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
                platformInfo.innerHTML = '<span class="platform-badge">🍎 iOS Detected</span>';
                iosBtn.style.display = 'block';
                androidBtn.style.display = 'none';
                iosBtn.href = 'https://apps.apple.com/kimoel-driver';
            } else {
                platformInfo.innerHTML = '<span class="platform-badge">💻 Desktop Detected</span>';
                androidBtn.style.display = 'block';
                iosBtn.style.display = 'block';
            }
        }

        // Auto-detect on page load
        detectPlatform();

        // Handle QR code click
        document.querySelector('.qr-image').addEventListener('click', function() {
            const userAgent = navigator.userAgent.toLowerCase();
            if (userAgent.includes('android')) {
                window.location.href = 'https://your-server.com/kimoel-driver.apk';
            } else if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
                window.location.href = 'https://apps.apple.com/kimoel-driver';
            } else {
                // Show platform selection
                alert('Please choose your platform below');
            }
        });

        // Track installation analytics
        function trackInstall(platform) {
            // Send analytics to your server
            fetch('https://your-server.com/api/track-install', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    platform: platform,
                    userAgent: navigator.userAgent,
                    timestamp: new Date().toISOString()
                })
            }).catch(err => console.log('Analytics error:', err));
        }

        // Track button clicks
        document.getElementById('androidBtn').addEventListener('click', () => trackInstall('android'));
        document.getElementById('iosBtn').addEventListener('click', () => trackInstall('ios'));
    </script>
</body>
</html>
