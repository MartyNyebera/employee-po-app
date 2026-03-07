class ApiConfig {
  // Update this with your actual server URL
  static const String baseUrl = 'https://employee-po-system.onrender.com';
  
  // API Endpoints
  static const String login = '$baseUrl/api/auth/login';
  static const String driverProfile = '$baseUrl/api/drivers/profile';
  static const String deliveries = '$baseUrl/api/deliveries';
  static const String updateDeliveryStatus = '$baseUrl/api/deliveries';
  static const String phoneLocation = '$baseUrl/api/phone-location';
  
  // Request timeout
  static const Duration connectTimeout = Duration(seconds: 10);
  static const Duration receiveTimeout = Duration(seconds: 10);
  
  // Retry configuration
  static const int maxRetries = 3;
  static const Duration retryDelay = Duration(seconds: 2);
}
