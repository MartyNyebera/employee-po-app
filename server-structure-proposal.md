// Proposed server structure
server/
├── index.js              # Main entry point
├── config/
│   ├── database.js       # DB configuration
│   ├── auth.js          # Auth middleware
│   └── cors.js          # CORS setup
├── routes/
│   ├── auth.js          # Authentication routes
│   ├── employees.js     # Employee management
│   ├── drivers.js       # Driver management
│   ├── fleet.js         # Fleet operations
│   ├── gps.js           # GPS tracking
│   └── materials.js     # Material requests
├── middleware/
│   ├── validation.js    # Request validation
│   ├── errorHandler.js  # Error handling
│   └── rateLimit.js     # Rate limiting
├── services/
│   ├── email.js         # Email service
│   ├── gps.js           # GPS service
│   └── notification.js  # Notification service
└── utils/
    ├── helpers.js       # Utility functions
    └── constants.js     # Application constants
