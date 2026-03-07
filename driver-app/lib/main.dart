import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:provider/provider.dart';
import 'package:background_fetch/background_fetch.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'src/app.dart';
import 'src/blocs/auth/auth_bloc.dart';
import 'src/blocs/delivery/delivery_bloc.dart';
import 'src/blocs/location/location_bloc.dart';
import 'src/services/location_service.dart';
import 'src/services/auth_service.dart';
import 'src/services/delivery_service.dart';
import 'src/services/notification_service.dart';
import 'src/services/storage_service.dart';

final FlutterLocalNotificationsPlugin flutterLocalNotificationsPlugin =
    FlutterLocalNotificationsPlugin();

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Initialize services
  await StorageService.init();
  await NotificationService.init(flutterLocalNotificationsPlugin);
  await LocationService.init();
  
  // Initialize background fetch
  await BackgroundFetch.registerTask(
    'com.kimoel.driver.background',
    config: BackgroundFetchConfig(
      minimumFetchInterval: 15, // 15 minutes
      stopOnTerminate: false,
      enableHeadless: true,
      requiresBatteryNotLow: false,
      requiresCharging: false,
      requiresStorageNotLow: false,
      requiresDeviceIdle: false,
      requiredNetworkType: NetworkType.ANY,
    ),
  );

  runApp(
    MultiProvider(
      providers: [
        Provider<AuthService>(create: (_) => AuthService()),
        Provider<DeliveryService>(create: (_) => DeliveryService()),
        Provider<LocationService>(create: (_) => LocationService()),
      ],
      child: MultiBlocProvider(
        providers: [
          BlocProvider(create: (context) => AuthBloc(context.read<AuthService>())),
          BlocProvider(create: (context) => DeliveryBloc(context.read<DeliveryService>())),
          BlocProvider(create: (context) => LocationBloc(context.read<LocationService>())),
        ],
        child: const KimoelDriverApp(),
      ),
    ),
  );
}
