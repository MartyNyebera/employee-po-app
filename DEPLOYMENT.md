# 🚀 Deployment Guide

## 🌐 Environment Configuration

Your app automatically detects the environment and adjusts URLs:

### **Development (Localhost)**
- Frontend: `http://localhost:3000`
- API: `http://localhost:3001`
- Traccar: `http://localhost:8082`

### **Local Network (Testing)**
- Frontend: `http://192.168.x.x:3000`
- API: `http://192.168.x.x:3001`
- Traccar: `http://192.168.x.x:8082`

### **Production (Live Domain)**
- Frontend: `https://app.yourdomain.com`
- API: `https://api.yourdomain.com`
- Traccar: `https://gps.yourdomain.com`

---

## 🏗️ Production Deployment Steps

### **1. Get a Domain & SSL**
```bash
# Buy domain (e.g., Namecheap, GoDaddy)
# Setup SSL certificate (Let's Encrypt is free)
```

### **2. Server Setup**
```bash
# Ubuntu/Debian Server (recommended)
sudo apt update
sudo apt install nginx nodejs npm postgresql

# Install PM2 for process management
sudo npm install -g pm2
```

### **3. Configure Environment**
```bash
# Edit environment config in src/app/config/environment.ts
# Update production URLs:
production: {
  API_URL: 'https://api.yourdomain.com',
  TRACCAR_URL: 'https://gps.yourdomain.com',
  APP_URL: 'https://app.yourdomain.com',
  WS_URL: 'wss://api.yourdomain.com',
}
```

### **4. Build & Deploy**
```bash
# Build the app
npm run build

# Deploy to server
rsync -av dist/ user@server:/var/www/app/
```

### **5. Nginx Configuration**
```nginx
# /etc/nginx/sites-available/yourdomain.com
server {
    listen 443 ssl;
    server_name app.yourdomain.com;
    
    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;
    
    location / {
        root /var/www/app;
        try_files $uri $uri/ /index.html;
    }
    
    location /api {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# Similar config for api.yourdomain.com and gps.yourdomain.com
```

### **6. Database Setup**
```bash
# Setup PostgreSQL
sudo -u postgres create database fleet_management
# Import your database schema
```

### **7. Start Services**
```bash
# Start backend with PM2
pm2 start server/index.js --name "fleet-api"

# Start Traccar server
sudo systemctl start traccar

# Restart Nginx
sudo systemctl restart nginx
```

---

## 📱 PWA Installation

After deployment, users can install the app:

### **Desktop Installation**
1. Visit `https://app.yourdomain.com`
2. Click ⬇️ install icon in browser
3. Install as desktop app

### **Mobile Installation**
1. Visit `https://app.yourdomain.com` on mobile
2. Tap "Share" → "Add to Home Screen"
3. Install as mobile app

---

## 🔧 Environment Auto-Detection

The app automatically detects environment based on hostname:

- `localhost` → Development
- `192.168.x.x` → Local Network
- `staging.*` → Staging
- `*.yourdomain.com` → Production

No manual configuration needed!

---

## 🚨 Quick Test Before Production

Test on your local network first:

```bash
# Find your IP
ipconfig | findstr "IPv4"

# Update environment config to use your IP
localNetwork: {
  API_URL: 'http://YOUR_IP:3001',
  TRACCAR_URL: 'http://YOUR_IP:8082',
  APP_URL: 'http://YOUR_IP:3000',
  WS_URL: 'ws://YOUR_IP:3001',
}

# Test from other devices on your network
```

---

## 📞 Support

For deployment issues:
1. Check server logs: `pm2 logs fleet-api`
2. Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`
3. Verify all services are running
4. Test API endpoints directly

Your app is production-ready! 🎉
