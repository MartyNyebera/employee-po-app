# Traccar GPS Integration Setup Guide

## Step 1: Install Missing npm Packages

Your network had issues installing these. Run this when your connection is stable:

```bash
npm install react-leaflet@4.2.1 @types/leaflet
```

Or try one at a time:
```bash
npm install react-leaflet@4.2.1
npm install @types/leaflet
```

**Note:** `leaflet` is already installed.

---

## Step 2: Install Traccar Server

### Download Traccar
1. Go to https://www.traccar.org/download/
2. Download **Windows Installer** (traccar-windows-64-X.X.exe)
3. Run the installer (default port: 8082 for web, 5013 for H02 protocol)

### First-time Setup
1. After installation, open http://localhost:8082 in your browser
2. Default login: `admin` / `admin`
3. Change the password immediately

### Add Your ST-906 Device
1. In Traccar web UI, go to **Settings** → **Devices** → **Add Device**
2. Fill in:
   - **Name**: e.g., "Truck Alpha" (matches your asset name)
   - **Identifier**: Your ST-906's **IMEI number** (15 digits, usually on the device label)
   - **Category**: truck / backhoe / excavator
3. Click **Save**

### Configure Your ST-906 GPS Tracker

Send these SMS commands to your ST-906 SIM card number:

1. **Set server IP and port:**
   ```
   SERVER#<your-server-ip>#5013#
   ```
   - If Traccar is on the same machine as your app: `SERVER#127.0.0.1#5013#`
   - If Traccar is on a different machine: `SERVER#192.168.x.x#5013#` (use your local IP)
   - If using a public server: `SERVER#your-domain.com#5013#`

2. **Set reporting interval (e.g., every 30 seconds):**
   ```
   TIMER#30#
   ```

3. **Check device status:**
   ```
   STATUS#
   ```
   The device will reply with current settings.

**Note:** ST-906 uses the **H02 protocol**, which Traccar listens for on port **5013** by default.

---

## Step 3: Verify Connection

1. Start Traccar server (should auto-start after installation)
2. Start your app backend: `npm run server`
3. Check Traccar status: http://localhost:3001/api/traccar/status
   - Should return: `{"connected": true}`
4. In Traccar web UI, check if your device shows **Online** status
5. View live positions: http://localhost:3001/api/traccar/positions

---

## Step 4: Test the Integration

Once `react-leaflet` is installed:

1. Start both servers:
   ```bash
   npm run dev:all
   ```
2. Log in to your app
3. Go to the **Fleet** page
4. You should see a live map with your vehicle markers
5. Click on a marker to see real-time GPS data

---

## Troubleshooting

### Device not showing in Traccar
- Check IMEI is correct (15 digits, no spaces)
- Verify ST-906 has cellular signal
- Check SMS commands were sent successfully (device replies with OK)

### No GPS positions
- Device needs clear sky view for GPS fix
- Check device battery/power
- Verify `TIMER#` interval is set (default may be too long)

### Traccar connection failed
- Ensure Traccar server is running (check Task Manager → Services → traccar)
- Check firewall allows port 8082 (web) and 5013 (H02)
- Verify `.env` has correct `TRACCAR_URL=http://localhost:8082`

### Map not loading
- Ensure `react-leaflet` and `@types/leaflet` are installed
- Check browser console for errors
- Verify Leaflet CSS is imported in the component

---

## API Endpoints Available

Your backend now has these Traccar endpoints:

- `GET /api/traccar/status` - Check if Traccar is reachable
- `GET /api/traccar/devices` - List all GPS devices
- `GET /api/traccar/positions` - Latest positions for all devices
- `GET /api/traccar/positions?deviceId=X` - Latest position for one device
- `GET /api/traccar/positions/history?deviceId=X&from=ISO&to=ISO` - Position history
- `POST /api/traccar/devices` - Register new device (admin only)
- `DELETE /api/traccar/devices/:id` - Remove device (admin only)

---

## Next Steps After Installation

1. Install the missing npm packages (Step 1)
2. Install Traccar server (Step 2)
3. Configure your ST-906 tracker (Step 2)
4. Restart your app and test the live map

The map component is already created in your app — it just needs the libraries installed to work.
