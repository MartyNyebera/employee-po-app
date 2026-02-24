# Render Setup Guide

## 🚨 CRITICAL: Fix "Cannot GET /" Error

The main issue is that Render's build command is only running `npm install` and NOT building the frontend.

## ⚡ QUICK FIX (2 minutes)

1. **Go to your Render Web Service dashboard**
2. **Click "Settings" tab**
3. **Scroll to "Build Command"**
4. **Change from:** `npm install`
5. **Change to:** `npm install && npm run build`
6. **Click "Save Changes"**
7. **Click "Manual Deploy" → "Deploy Latest Commit"**

## 📋 Complete Configuration

### Build Settings
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm run init && npm run server`
- **Runtime**: Node

### Environment Variables
```
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://... (from PostgreSQL service)
ALLOW_SEED=false
ENABLE_HTTPS=false
```

## 🔍 What This Fixes

### Before Fix:
- Build: `npm install` only
- Result: No frontend built → "Cannot GET /"

### After Fix:
- Build: `npm install && npm run build`
- Result: Vite builds frontend to `/dist` → React app loads
- Verification: postbuild checks all possible paths for index.html
- Failure: Build fails if no frontend found (prevents broken deployment)

## 🎯 Expected Results

After fixing the build command:

1. **Build Phase:**
   ```
   npm install (dependencies)
   npm run build (Vite builds to /dist)
   npm run postbuild (verifies build)
   ```

2. **Start Phase:**
   ```
   npm run init (database)
   npm run server (starts with frontend)
   ```

3. **Live App:**
   - `/` → React app loads
   - `/health` → returns "ok"
   - `/api/*` → Backend API works

## 🚀 Test After Deploy

1. **Health Check:** `https://your-app.onrender.com/health`
   - Should return: `ok`

2. **Frontend:** `https://your-app.onrender.com`
   - Should load Employee Purchase Order App

3. **API:** `https://your-app.onrender.com/api/vehicles`
   - Should return JSON (if logged in)

## 🔧 If Still Issues

Check Render logs for:
```
=== FRONTEND BUILD VERIFICATION ===
✅ Frontend build successful!

=== FRONTEND STATIC SERVING SETUP ===
✅ Found frontend directory: /opt/render/project/src/dist
📄 Index.html exists: true
```

If you see "❌ ERROR: Could not find frontend build directory", the build command is still wrong.
