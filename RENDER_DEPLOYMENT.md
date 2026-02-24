# Render Deployment Configuration

## Build Settings
- **Build Command**: `npm ci && npm run build`
- **Start Command**: `npm run init && npm run server`

## Build Process
1. `npm ci` - Install dependencies
2. `npm run build` - Build Vite frontend to /dist
3. `npm run postbuild` - Verify frontend build
4. `npm run init` - Initialize database
5. `npm run server` - Start server

## Environment Variables
```
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://... (from Render PostgreSQL service)
ALLOW_SEED=false
ENABLE_HTTPS=false
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

## Services Required
1. **Web Service**: Main application
2. **PostgreSQL**: Database service

## Health Check
- **Endpoint**: `/health`
- **Expected Response**: `{"status":"ok","timestamp":"..."}`

## API Routes
- All API routes are prefixed with `/api/*`
- Frontend SPA routes handled by regex fallback
- Static files served from `/dist` in production

## Debugging
Check Render logs for:
- Current working directory
- Dist folder existence
- Files in dist folder
- SPA fallback requests
