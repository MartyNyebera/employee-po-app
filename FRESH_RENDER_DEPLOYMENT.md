# Fresh Render Deployment Guide

## 🚀 Create New Web Service (Step-by-Step)

### 1. Delete Old Service
- Go to Render Dashboard
- Delete the old web service
- Keep the PostgreSQL database (reuse it)

### 2. Create New Web Service
- Click "New +" → "Web Service"
- Connect to GitHub repository
- Select: `MartyNyebera/employee-po-app`
- Branch: `main`

### 3. Configure Settings
**Name:** `employee-purchase-order-app`

**Environment:** `Node`

**Build Command:** `npm install && npm run build`

**Start Command:** `npm run init && npm run server`

### 4. Environment Variables
```
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://[COPY FROM POSTGRESQL SERVICE]
ALLOW_SEED=false
ENABLE_HTTPS=false
```

### 5. Connect Database
- Go to PostgreSQL service
- Copy "Internal Database URL"
- Paste into web service environment variables

### 6. Deploy
- Click "Create Web Service"
- Wait for deployment

## 🔍 Expected Logs

### Build Phase Should Show:
```
=== STARTING VITE BUILD ===
vite v6.3.5 building for production...
✓ 1702 modules transformed.
=== VITE BUILD COMPLETED ===

=== STARTING FRONTEND VERIFICATION ===
✅ Frontend build OK. Found index.html in: /opt/render/project/src/dist
=== FRONTEND VERIFICATION COMPLETED ===
```

### Start Phase Should Show:
```
=== CHECKING IF FRONTEND WAS BUILT DURING DEPLOYMENT ===
✅ Frontend build found - build command was executed
Build timestamp: [timestamp]

=== FRONTEND STATIC SERVING SETUP ===
✅ Found frontend directory: /opt/render/project/src/dist
📄 Index.html exists: true
```

## 🎯 Success Indicators

1. **Build completes** without errors
2. **Service status:** "Live"
3. **URL loads** React app
4. **Health check:** `/health` returns "ok"
5. **API works:** `/api/vehicles` returns JSON

## 🚨 Troubleshooting

If still fails:
1. Check build phase logs for errors
2. Verify DATABASE_URL is correct
3. Make sure PostgreSQL service is "Live"
4. Check for any "command not found" errors

## 📱 Test After Deploy

1. **Health:** `https://your-app.onrender.com/health`
2. **Frontend:** `https://your-app.onrender.com`
3. **Login:** `owner@kimoel.local` / `ChangeMe123!`

This fresh start should eliminate any cached issues!
