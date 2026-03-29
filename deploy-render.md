# Deploy to Render - Step by Step

## 1. Create Render Account
- Go to https://render.com
- Sign up with GitHub (free)

## 2. Connect Your Repository
- Click "New +" → "Web Service"
- Connect your GitHub repo: `MartyNyebera/employee-po-app`

## 3. Deploy Backend
- **Name**: `employee-po-api`
- **Environment**: `Node`
- **Plan**: `Free`
- **Build Command**: `npm install`
- **Start Command**: `npm run server`

## 4. Add Environment Variables (Backend)
In your Render dashboard, add these to your backend service:
```
NODE_ENV=production
DATABASE_URL=your-render-database-url
JWT_SECRET=your-jwt-secret
SUPER_ADMIN_OWNER_EMAIL=kimoel_leotagle@yahoo.com
SUPER_ADMIN_OWNER_NAME=Leo Tagle
SUPER_ADMIN_OWNER_PASSWORD=Kimoeltrading&construction.inc
```

## 5. Deploy Frontend
- Click "New +" → "Static Site"
- **Name**: `employee-po-frontend`
- **Build Command**: `npm run build`
- **Publish Directory**: `dist`
- **Add Custom Domain** (optional)

## 6. Update Frontend API URL
In your frontend, update the API calls to use your Render backend URL:
```javascript
// In vite.config.ts
server: {
  proxy: {
    '/api': {
      target: 'https://your-backend-name.onrender.com',
      changeOrigin: true,
    },
  },
},
```

## 7. Deploy Database
- Click "New +" → "PostgreSQL"
- **Name**: `employee-po-db`
- **Plan**: `Free`
- Copy the DATABASE_URL to your backend environment variables

## 8. Initialize Database
Once deployed, run:
```bash
curl https://your-backend-name.onrender.com/api/init
```

## Your URLs Will Be:
- **Frontend**: `https://employee-po-frontend.onrender.com`
- **Backend API**: `https://employee-po-api.onrender.com`
- **Database**: Provided by Render

## Free Plan Limits:
- **Backend**: 750 hours/month (enough for 24/7)
- **Frontend**: Unlimited static hosting
- **Database**: 256MB storage, 90 days inactivity sleep

## Alternative: Vercel + Supabase
If Render doesn't work, try:
- **Frontend**: Vercel (free, better for React)
- **Backend**: Vercel Serverless Functions
- **Database**: Supabase (free PostgreSQL)
