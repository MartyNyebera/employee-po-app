# Kimoel Driver App - Professional Delivery Tracking

## 🚗 Features Built

### ✅ **Core Architecture**
- **Flutter framework** with Dart language
- **Background GPS tracking** (works during work hours 9 AM - 6 PM)
- **Secure authentication** with token storage
- **Real-time location updates** every 30 seconds
- **Offline data sync** for poor network areas
- **Professional UI** with Kimoel branding

### ✅ **Background GPS Capabilities**
- **Automatic tracking** during work hours only
- **Background location service** (iOS/Android native)
- **Battery-efficient** tracking intervals
- **Work hour enforcement** (9 AM - 6 PM)
- **Offline storage** with sync when online
- **Permission handling** for location access

### ✅ **Security & Privacy**
- **JWT token authentication**
- **Secure storage** for credentials
- **Work-hour only tracking** (respecting privacy)
- **Transparent consent** on login screen
- **No tracking outside work hours**

---

## 📱 How It Works

### **1. Driver Login**
```
Email: driver@kimoel.com
Password: [driver's password]
```
- Clear consent for GPS tracking during work hours
- Automatic work hour scheduling (9 AM - 6 PM)

### **2. Automatic GPS Tracking**
- **Starts automatically** when driver logs in (during work hours)
- **Stops automatically** at 6 PM
- **Runs in background** even when app is closed
- **Sends location** every 30 seconds to server
- **Works offline** and syncs when connection returns

### **3. Server Integration**
- Connects to your existing API: `https://employee-po-system.onrender.com`
- Uses same `/api/phone-location` endpoint
- Includes driver ID and device ID in location data
- Compatible with your current GPS tracking system

---

## 🛠️ Setup Instructions

### **Prerequisites**
1. **Flutter SDK** (3.10.0 or higher)
2. **Android Studio** or **Xcode**
3. **Physical device** (recommended for GPS testing)

### **Installation**
```bash
# Clone or navigate to driver-app directory
cd driver-app

# Install dependencies
flutter pub get

# Run on Android
flutter run

# Run on iOS
flutter run -d ios
```

### **Configuration**
1. **Update API URL** in `lib/src/config/api_config.dart`:
   ```dart
   static const String baseUrl = 'https://your-server.com';
   ```

2. **Set work hours** (default 9 AM - 6 PM):
   ```dart
   final workStart = prefs.getString('work_start') ?? '09:00';
   final workEnd = prefs.getString('work_end') ?? '18:00';
   ```

---

## 📋 File Structure

```
driver-app/
├── lib/
│   ├── src/
│   │   ├── services/
│   │   │   ├── location_service.dart     # Background GPS tracking
│   │   │   ├── auth_service.dart          # Login/authentication
│   │   │   └── storage_service.dart       # Local storage
│   │   ├── models/
│   │   │   ├── location_data.dart         # GPS location model
│   │   │   └── driver.dart               # Driver profile model
│   │   ├── screens/
│   │   │   ├── login_screen.dart          # Driver login
│   │   │   ├── home_screen.dart           # Dashboard
│   │   │   └── delivery_screens.dart     # Delivery management
│   │   ├── theme/
│   │   │   └── app_theme.dart            # UI styling
│   │   └── config/
│   │       └── api_config.dart           # API endpoints
│   ├── main.dart                         # App entry point
│   └── app.dart                          # App navigation
├── android/
│   └── app/src/main/AndroidManifest.xml # Android permissions
├── ios/
│   └── Runner/Info.plist                # iOS permissions
└── pubspec.yaml                          # Dependencies
```

---

## 🔐 Permissions Required

### **Android**
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.INTERNET" />
```

### **iOS**
```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>GPS tracking during work hours for delivery management</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Background GPS tracking during work hours</string>
<key>UIBackgroundModes</key>
<array>
    <string>location</string>
    <string>background-fetch</string>
</array>
```

---

## 🚀 Key Features

### **Background GPS Tracking**
- ✅ **30-second intervals** during work hours
- ✅ **Battery-efficient** tracking
- ✅ **Offline sync** capability
- ✅ **Automatic start/stop** based on work hours
- ✅ **Error recovery** and retry logic

### **Driver Privacy**
- ✅ **Work hours only** tracking (9 AM - 6 PM)
- ✅ **Transparent consent** on login
- ✅ **No tracking** outside work hours
- ✅ **Secure data** transmission
- ✅ **Local storage** encryption

### **Server Integration**
- ✅ **Compatible** with existing API
- ✅ **Driver ID** included in location data
- ✅ **Device identification** for multiple drivers
- ✅ **Error handling** and retry logic
- ✅ **Real-time updates** to main dashboard

---

## 📊 How to Test

### **1. Setup Test Driver**
1. Create a driver account in your main system
2. Note the driver email and password
3. Ensure driver has "employee" role

### **2. Test GPS Tracking**
1. Install app on physical phone
2. Login with test driver credentials
3. Check main dashboard - driver should appear on map
4. Verify location updates every 30 seconds

### **3. Test Work Hours**
1. Login before 9 AM - tracking should start
2. Login after 6 PM - tracking should not start
3. Keep app open until 6 PM - tracking should stop automatically

---

## 🔄 Next Steps

### **Phase 1 - Core Tracking** ✅ COMPLETED
- [x] Background GPS tracking
- [x] Driver authentication
- [x] Work hour enforcement
- [x] Server integration

### **Phase 2 - Delivery Management** (Next)
- [ ] View assigned deliveries
- [ ] Update delivery status
- [ ] Customer navigation
- [ ] Proof of delivery

### **Phase 3 - Advanced Features** (Future)
- [ ] Route optimization
- [ ] Fuel tracking
- [ ] Performance analytics
- [ ] Customer communication

---

## 🎯 Business Benefits

### **Operational Efficiency**
- **Real-time visibility** of driver locations
- **Automated tracking** - no manual intervention
- **Work hour compliance** - respects driver privacy
- **Battery optimization** - longer device life

### **Legal Compliance**
- **Informed consent** - drivers know they're tracked
- **Work-hour only** tracking - respects privacy
- **Secure data** - encrypted storage and transmission
- **Transparent policies** - clear communication

### **Cost Savings**
- **Single app** for all drivers (iOS/Android)
- **No additional hardware** needed
- **Efficient routes** - better fuel management
- **Reduced administrative overhead**

---

## 📞 Support

For questions or issues:
1. Check the console logs in the app
2. Verify server connectivity
3. Ensure permissions are granted
4. Test with physical device (GPS doesn't work in simulator)

---

**🚀 Ready for production deployment!**
