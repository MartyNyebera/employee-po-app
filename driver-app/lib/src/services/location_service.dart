import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:background_location/background_location.dart';
import 'package:background_fetch/background_fetch.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:dio/dio.dart';
import '../models/location_data.dart';
import '../config/api_config.dart';

class LocationService {
  static final LocationService _instance = LocationService._internal();
  factory LocationService() => _instance;
  LocationService._internal();

  static bool _isInitialized = false;
  static bool _isTracking = false;
  static StreamSubscription<Position>? _positionStreamSubscription;
  static Timer? _backgroundTimer;
  static final Dio _dio = Dio();

  static Future<void> init() async {
    if (_isInitialized) return;
    
    // Initialize background location
    await BackgroundLocation.setAndroidNotification(
      title: "Kimoel Driver Tracking",
      message: "Your location is being tracked during work hours",
      icon: "@mipmap/ic_launcher",
    );

    // Initialize background fetch
    BackgroundFetch.configure(
      BackgroundFetchConfig(
        minimumFetchInterval: 15, // 15 minutes
        stopOnTerminate: false,
        enableHeadless: true,
        requiresBatteryNotLow: false,
        requiresCharging: false,
        requiresStorageNotLow: false,
        requiresDeviceIdle: false,
        requiredNetworkType: NetworkType.ANY,
      ),
      _onBackgroundFetch,
      _onBackgroundTimeout,
    );

    _isInitialized = true;
    debugPrint('LocationService initialized');
  }

  static Future<bool> requestPermissions() async {
    try {
      // Request location permissions
      final locationPermission = await Permission.location.request();
      final locationAlwaysPermission = await Permission.locationAlways.request();
      
      if (locationPermission.isDenied || locationAlwaysPermission.isDenied) {
        debugPrint('Location permission denied');
        return false;
      }

      // Request background location for Android
      if (Platform.isAndroid) {
        final backgroundLocationPermission = await Permission.locationAlways.request();
        if (backgroundLocationPermission.isDenied) {
          debugPrint('Background location permission denied');
          return false;
        }
      }

      // Request notification permission
      final notificationPermission = await Permission.notification.request();
      if (notificationPermission.isDenied) {
        debugPrint('Notification permission denied');
        return false;
      }

      debugPrint('All location permissions granted');
      return true;
    } catch (e) {
      debugPrint('Error requesting permissions: $e');
      return false;
    }
  }

  static Future<bool> isWithinWorkHours() async {
    final prefs = await SharedPreferences.getInstance();
    final now = DateTime.now();
    final workStart = prefs.getString('work_start') ?? '09:00';
    final workEnd = prefs.getString('work_end') ?? '18:00';
    
    final startTime = DateTime.parse('${now.year}-${now.month}-${now.day} $workStart:00');
    final endTime = DateTime.parse('${now.year}-${now.month}-${now.day} $workEnd:00');
    
    return now.isAfter(startTime) && now.isBefore(endTime);
  }

  static Future<void> startTracking() async {
    if (_isTracking) return;

    try {
      // Check if within work hours
      final withinWorkHours = await isWithinWorkHours();
      if (!withinWorkHours) {
        debugPrint('Outside work hours, tracking not started');
        return;
      }

      // Check permissions
      final hasPermissions = await requestPermissions();
      if (!hasPermissions) {
        debugPrint('Location permissions not granted');
        return;
      }

      // Start background location tracking
      await BackgroundLocation.startService(
        distanceFilter: 20.0,
        interval: 30000, // 30 seconds
      );

      // Start foreground location updates
      _positionStreamSubscription = Geolocator.getPositionStream(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          distanceFilter: 10,
        ),
      ).listen(_onLocationUpdate);

      // Start background fetch
      await BackgroundFetch.start();

      _isTracking = true;
      debugPrint('Location tracking started');
      
      // Store tracking state
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool('is_tracking', true);
      
    } catch (e) {
      debugPrint('Error starting location tracking: $e');
    }
  }

  static Future<void> stopTracking() async {
    if (!_isTracking) return;

    try {
      // Stop background location
      await BackgroundLocation.stopService();
      
      // Stop position stream
      await _positionStreamSubscription?.cancel();
      _positionStreamSubscription = null;
      
      // Stop background fetch
      await BackgroundFetch.stop();

      _isTracking = false;
      debugPrint('Location tracking stopped');
      
      // Store tracking state
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool('is_tracking', false);
      
    } catch (e) {
      debugPrint('Error stopping location tracking: $e');
    }
  }

  static Future<void> _onLocationUpdate(Position position) async {
    try {
      final locationData = LocationData(
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
        speed: position.speed,
        heading: position.heading,
        timestamp: position.timestamp?.millisecondsSinceEpoch ?? DateTime.now().millisecondsSinceEpoch,
      );

      // Send to server
      await _sendLocationToServer(locationData);
      
      // Store locally for offline backup
      await _storeLocationLocally(locationData);
      
    } catch (e) {
      debugPrint('Error handling location update: $e');
    }
  }

  static Future<void> _sendLocationToServer(LocationData locationData) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final driverId = prefs.getString('driver_id');
      final deviceId = prefs.getString('device_id') ?? 'flutter-driver-${DateTime.now().millisecondsSinceEpoch}';

      if (driverId == null) {
        debugPrint('Driver ID not found, cannot send location');
        return;
      }

      await _dio.post(
        '${ApiConfig.baseUrl}/api/phone-location',
        data: {
          'deviceId': deviceId,
          'lat': locationData.latitude,
          'lng': locationData.longitude,
          'accuracy': locationData.accuracy,
          'speed': locationData.speed,
          'heading': locationData.heading,
          'timestamp': locationData.timestamp,
          'driverId': driverId,
        },
        options: Options(
          headers: {
            'Content-Type': 'application/json',
          },
          connectTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 10),
        ),
      );

      debugPrint('Location sent to server: ${locationData.latitude}, ${locationData.longitude}');
    } catch (e) {
      debugPrint('Error sending location to server: $e');
      // Store for later sync
      await _storeLocationForSync(locationData);
    }
  }

  static Future<void> _storeLocationLocally(LocationData locationData) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final locations = prefs.getStringList('cached_locations') ?? [];
      
      locations.add(locationData.toJson());
      
      // Keep only last 100 locations
      if (locations.length > 100) {
        locations.removeRange(0, locations.length - 100);
      }
      
      await prefs.setStringList('cached_locations', locations);
    } catch (e) {
      debugPrint('Error storing location locally: $e');
    }
  }

  static Future<void> _storeLocationForSync(LocationData locationData) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final syncLocations = prefs.getStringList('sync_locations') ?? [];
      
      syncLocations.add(locationData.toJson());
      await prefs.setStringList('sync_locations', syncLocations);
    } catch (e) {
      debugPrint('Error storing location for sync: $e');
    }
  }

  static Future<void> syncCachedLocations() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final syncLocations = prefs.getStringList('sync_locations') ?? [];
      
      if (syncLocations.isEmpty) return;

      for (final locationJson in syncLocations) {
        try {
          final locationData = LocationData.fromJson(locationJson);
          await _sendLocationToServer(locationData);
        } catch (e) {
          debugPrint('Error syncing cached location: $e');
        }
      }
      
      // Clear synced locations
      await prefs.setStringList('sync_locations', []);
      debugPrint('Synced ${syncLocations.length} cached locations');
    } catch (e) {
      debugPrint('Error syncing cached locations: $e');
    }
  }

  static Future<void> _onBackgroundFetch(String taskId) async {
    debugPrint('Background fetch triggered: $taskId');
    
    try {
      // Check if within work hours
      final withinWorkHours = await isWithinWorkHours();
      if (!withinWorkHours) {
        debugPrint('Outside work hours, skipping background fetch');
        return;
      }

      // Get current location
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );

      final locationData = LocationData(
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
        speed: position.speed,
        heading: position.heading,
        timestamp: position.timestamp?.millisecondsSinceEpoch ?? DateTime.now().millisecondsSinceEpoch,
      );

      await _sendLocationToServer(locationData);
      
      BackgroundFetch.finish(taskId);
    } catch (e) {
      debugPrint('Error in background fetch: $e');
      BackgroundFetch.finish(taskId);
    }
  }

  static Future<void> _onBackgroundTimeout(String taskId) async {
    debugPrint('Background fetch timeout: $taskId');
    BackgroundFetch.finish(taskId);
  }

  static bool get isTracking => _isTracking;

  static Future<LocationData?> getCurrentLocation() async {
    try {
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );

      return LocationData(
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
        speed: position.speed,
        heading: position.heading,
        timestamp: position.timestamp?.millisecondsSinceEpoch ?? DateTime.now().millisecondsSinceEpoch,
      );
    } catch (e) {
      debugPrint('Error getting current location: $e');
      return null;
    }
  }

  static Future<void> checkAndRestartTracking() async {
    final prefs = await SharedPreferences.getInstance();
    final wasTracking = prefs.getBool('is_tracking') ?? false;
    
    if (wasTracking && !_isTracking) {
      final withinWorkHours = await isWithinWorkHours();
      if (withinWorkHours) {
        debugPrint('Restarting location tracking');
        await startTracking();
      }
    }
  }
}
