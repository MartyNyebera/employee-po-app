class Driver {
  final String id;
  final String name;
  final String email;
  final String role;
  final String? driverName;
  final String? contact;
  final String? licenseNumber;
  final String? licenseExpiry;
  final String? assignedVehicleId;
  final String? vehicleName;
  final String? plateNumber;
  final String? status;
  final String? joinDate;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  Driver({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    this.driverName,
    this.contact,
    this.licenseNumber,
    this.licenseExpiry,
    this.assignedVehicleId,
    this.vehicleName,
    this.plateNumber,
    this.status,
    this.joinDate,
    this.createdAt,
    this.updatedAt,
  });

  factory Driver.fromJson(Map<String, dynamic> json) {
    return Driver(
      id: json['id'] as String,
      name: json['name'] as String,
      email: json['email'] as String,
      role: json['role'] as String,
      driverName: json['driver_name'] as String?,
      contact: json['contact'] as String?,
      licenseNumber: json['license_number'] as String?,
      licenseExpiry: json['license_expiry'] as String?,
      assignedVehicleId: json['assigned_vehicle_id'] as String?,
      vehicleName: json['vehicle_name'] as String?,
      plateNumber: json['plate_number'] as String?,
      status: json['status'] as String?,
      joinDate: json['join_date'] as String?,
      createdAt: json['created_at'] != null 
          ? DateTime.parse(json['created_at'] as String)
          : null,
      updatedAt: json['updated_at'] != null 
          ? DateTime.parse(json['updated_at'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'email': email,
      'role': role,
      'driver_name': driverName,
      'contact': contact,
      'license_number': licenseNumber,
      'license_expiry': licenseExpiry,
      'assigned_vehicle_id': assignedVehicleId,
      'vehicle_name': vehicleName,
      'plate_number': plateNumber,
      'status': status,
      'join_date': joinDate,
      'created_at': createdAt?.toIso8601String(),
      'updated_at': updatedAt?.toIso8601String(),
    };
  }

  Driver copyWith({
    String? id,
    String? name,
    String? email,
    String? role,
    String? driverName,
    String? contact,
    String? licenseNumber,
    String? licenseExpiry,
    String? assignedVehicleId,
    String? vehicleName,
    String? plateNumber,
    String? status,
    String? joinDate,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return Driver(
      id: id ?? this.id,
      name: name ?? this.name,
      email: email ?? this.email,
      role: role ?? this.role,
      driverName: driverName ?? this.driverName,
      contact: contact ?? this.contact,
      licenseNumber: licenseNumber ?? this.licenseNumber,
      licenseExpiry: licenseExpiry ?? this.licenseExpiry,
      assignedVehicleId: assignedVehicleId ?? this.assignedVehicleId,
      vehicleName: vehicleName ?? this.vehicleName,
      plateNumber: plateNumber ?? this.plateNumber,
      status: status ?? this.status,
      joinDate: joinDate ?? this.joinDate,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  @override
  String toString() {
    return 'Driver(id: $id, name: $name, email: $email, role: $role)';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Driver &&
        other.id == id &&
        other.email == email;
  }

  @override
  int get hashCode {
    return id.hashCode ^ email.hashCode;
  }

  // Helper getters
  bool get isActive => status?.toLowerCase() == 'active';
  bool get hasVehicle => assignedVehicleId != null;
  String get displayName => driverName ?? name;
  
  // Check if license is expiring soon (within 30 days)
  bool get isLicenseExpiringSoon {
    if (licenseExpiry == null) return false;
    try {
      final expiryDate = DateTime.parse(licenseExpiry!);
      final now = DateTime.now();
      final daysUntilExpiry = expiryDate.difference(now).inDays;
      return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
    } catch (e) {
      return false;
    }
  }

  // Check if license is expired
  bool get isLicenseExpired {
    if (licenseExpiry == null) return false;
    try {
      final expiryDate = DateTime.parse(licenseExpiry!);
      return DateTime.now().isAfter(expiryDate);
    } catch (e) {
      return false;
    }
  }
}
