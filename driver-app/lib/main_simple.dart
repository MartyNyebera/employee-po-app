import 'package:flutter/material.dart';

void main() {
  runApp(KimoelDriverApp());
}

class KimoelDriverApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Kimoel Driver',
      theme: ThemeData(
        primarySwatch: Colors.blue,
        visualDensity: VisualDensity.adaptivePlatformDensity,
      ),
      home: DriverHomePage(),
    );
  }
}

class DriverHomePage extends StatefulWidget {
  @override
  _DriverHomePageState createState() => _DriverHomePageState();
}

class _DriverHomePageState extends State<DriverHomePage> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Kimoel Driver'),
        backgroundColor: Colors.blue[800],
      ),
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Colors.blue[50]!, Colors.white],
          ),
        ),
        child: Padding(
          padding: EdgeInsets.all(20.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.local_shipping,
                size: 100,
                color: Colors.blue[800],
              ),
              SizedBox(height: 30),
              Text(
                'Welcome to Kimoel Driver',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: Colors.blue[800],
                ),
                textAlign: TextAlign.center,
              ),
              SizedBox(height: 20),
              Text(
                'Professional Delivery Tracking System',
                style: TextStyle(
                  fontSize: 16,
                  color: Colors.grey[600],
                ),
                textAlign: TextAlign.center,
              ),
              SizedBox(height: 40),
              Card(
                elevation: 8,
                child: Padding(
                  padding: EdgeInsets.all(20.0),
                  child: Column(
                    children: [
                      ListTile(
                        leading: Icon(Icons.gps_fixed, color: Colors.green),
                        title: Text('GPS Tracking Active'),
                        subtitle: Text('Location updates every 30 seconds'),
                      ),
                      Divider(),
                      ListTile(
                        leading: Icon(Icons.work, color: Colors.blue),
                        title: Text('Work Hours: 9 AM - 6 PM'),
                        subtitle: Text('Tracking only during work hours'),
                      ),
                      Divider(),
                      ListTile(
                        leading: Icon(Icons.security, color: Colors.orange),
                        title: Text('Secure & Private'),
                        subtitle: Text('Your data is encrypted and safe'),
                      ),
                    ],
                  ),
                ),
              ),
              SizedBox(height: 30),
              ElevatedButton(
                onPressed: () {
                  // Show login dialog
                  showDialog(
                    context: context,
                    builder: (context) => AlertDialog(
                      title: Text('Driver Login'),
                      content: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          TextField(
                            decoration: InputDecoration(
                              labelText: 'Email',
                              hintText: 'driver@kimoel.com',
                            ),
                          ),
                          SizedBox(height: 10),
                          TextField(
                            obscureText: true,
                            decoration: InputDecoration(
                              labelText: 'Password',
                            ),
                          ),
                        ],
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(context),
                          child: Text('Cancel'),
                        ),
                        ElevatedButton(
                          onPressed: () {
                            Navigator.pop(context);
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('Login successful! GPS tracking started.'),
                                backgroundColor: Colors.green,
                              ),
                            );
                          },
                          child: Text('Login'),
                        ),
                      ],
                    ),
                  );
                },
                child: Text('Login to Start Tracking'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.blue[800],
                  foregroundColor: Colors.white,
                  padding: EdgeInsets.symmetric(horizontal: 40, vertical: 15),
                  textStyle: TextStyle(fontSize: 16),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
