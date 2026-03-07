import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/api_config.dart';
import '../models/driver.dart';

class AuthService {
  final Dio _dio = Dio();
  final FlutterSecureStorage _secureStorage = const FlutterSecureStorage();

  AuthService() {
    _dio.options.baseUrl = ApiConfig.baseUrl;
    _dio.options.connectTimeout = ApiConfig.connectTimeout;
    _dio.options.receiveTimeout = ApiConfig.receiveTimeout;
    _dio.options.headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  Future<Driver> login(String email, String password) async {
    try {
      final response = await _dio.post(
        ApiConfig.login,
        data: {
          'email': email.toLowerCase().trim(),
          'password': password,
        },
      );

      if (response.statusCode == 200) {
        final data = response.data;
        final user = data['user'];
        final token = data['token'];

        // Store credentials securely
        await _secureStorage.write(key: 'auth_token', value: token);
        await _secureStorage.write(key: 'driver_id', value: user['id']);
        await _secureStorage.write(key: 'driver_email', value: user['email']);
        await _secureStorage.write(key: 'driver_name', value: user['name']);
        await _secureStorage.write(key: 'driver_role', value: user['role']);

        // Update dio with auth token
        _dio.options.headers['Authorization'] = 'Bearer $token';

        return Driver.fromJson(user);
      } else {
        throw Exception('Login failed: ${response.statusCode}');
      }
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        throw Exception('Invalid email or password');
      } else if (e.response?.statusCode == 403) {
        throw Exception('Account not authorized for driver access');
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Login failed: ${e.toString()}');
    }
  }

  Future<Driver> getDriverProfile() async {
    try {
      final token = await _secureStorage.read(key: 'auth_token');
      if (token == null) {
        throw Exception('Not authenticated');
      }

      _dio.options.headers['Authorization'] = 'Bearer $token';

      final response = await _dio.get(ApiConfig.driverProfile);

      if (response.statusCode == 200) {
        return Driver.fromJson(response.data);
      } else {
        throw Exception('Failed to fetch profile: ${response.statusCode}');
      }
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        await logout();
        throw Exception('Session expired. Please login again.');
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Failed to fetch profile: ${e.toString()}');
    }
  }

  Future<bool> isLoggedIn() async {
    try {
      final token = await _secureStorage.read(key: 'auth_token');
      final driverId = await _secureStorage.read(key: 'driver_id');
      
      return token != null && driverId != null;
    } catch (e) {
      return false;
    }
  }

  Future<String?> getAuthToken() async {
    return await _secureStorage.read(key: 'auth_token');
  }

  Future<String?> getDriverId() async {
    return await _secureStorage.read(key: 'driver_id');
  }

  Future<String?> getDriverName() async {
    return await _secureStorage.read(key: 'driver_name');
  }

  Future<void> logout() async {
    try {
      // Clear secure storage
      await _secureStorage.deleteAll();
      
      // Clear dio headers
      _dio.options.headers.remove('Authorization');
    } catch (e) {
      // Even if logout fails, continue
    }
  }

  Future<void> refreshToken() async {
    try {
      final token = await _secureStorage.read(key: 'auth_token');
      if (token == null) {
        throw Exception('No token to refresh');
      }

      // Update dio with current token
      _dio.options.headers['Authorization'] = 'Bearer $token';

      // You might want to implement a refresh token endpoint
      // For now, we'll just validate the current token by fetching profile
      await getDriverProfile();
    } catch (e) {
      await logout();
      throw Exception('Session expired. Please login again.');
    }
  }

  Future<void> updateDriverProfile(Map<String, dynamic> updates) async {
    try {
      final token = await _secureStorage.read(key: 'auth_token');
      if (token == null) {
        throw Exception('Not authenticated');
      }

      _dio.options.headers['Authorization'] = 'Bearer $token';

      final response = await _dio.patch(
        '${ApiConfig.driverProfile}/update',
        data: updates,
      );

      if (response.statusCode == 200) {
        // Update stored driver info if needed
        if (updates.containsKey('name')) {
          await _secureStorage.write(key: 'driver_name', value: updates['name']);
        }
      } else {
        throw Exception('Failed to update profile: ${response.statusCode}');
      }
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        await logout();
        throw Exception('Session expired. Please login again.');
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Failed to update profile: ${e.toString()}');
    }
  }

  Future<void> changePassword(String currentPassword, String newPassword) async {
    try {
      final token = await _secureStorage.read(key: 'auth_token');
      if (token == null) {
        throw Exception('Not authenticated');
      }

      _dio.options.headers['Authorization'] = 'Bearer $token';

      final response = await _dio.post(
        '${ApiConfig.driverProfile}/change-password',
        data: {
          'currentPassword': currentPassword,
          'newPassword': newPassword,
        },
      );

      if (response.statusCode != 200) {
        throw Exception('Failed to change password: ${response.statusCode}');
      }
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        await logout();
        throw Exception('Session expired. Please login again.');
      } else if (e.response?.statusCode == 400) {
        throw Exception('Current password is incorrect');
      } else {
        throw Exception('Network error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Failed to change password: ${e.toString()}');
    }
  }
}
