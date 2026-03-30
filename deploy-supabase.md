# Deploy with Supabase Database + Render Frontend (Best Free Setup)

## Why This Setup:
- ✅ Supabase: 500MB database, always online, no sleep
- ✅ Render: Free frontend hosting
- ✅ Total cost: $0
- ✅ Better performance than Render's database

## Step 1: Setup Supabase Database
1. Go to https://supabase.com
2. Click "Start your project"
3. Sign up with GitHub
4. Create new project:
   - **Organization**: Your name
   - **Project Name**: employee-po-app
   - **Database Password**: Create strong password
   - **Region**: Choose closest to you

## Step 2: Get Database URL
1. In Supabase dashboard → Settings → Database
2. Copy the **Connection string**
3. Format: `postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`

## Step 3: Deploy Backend to Render
1. Go to https://render.com
2. Connect your GitHub repo
3. Create **Web Service**:
   - **Name**: employee-po-api
   - **Environment**: Node
   - **Plan**: Free
   - **Build Command**: `npm install`
   - **Start Command**: `npm run server`

## Step 4: Add Environment Variables (Render)
In your Render backend service, add:
```
NODE_ENV=production
DATABASE_URL=your-supabase-connection-string
JWT_SECRET=kimoel-employee-po-secret-key-2024
SUPER_ADMIN_OWNER_EMAIL=kimoel_leotagle@yahoo.com
SUPER_ADMIN_OWNER_NAME=Leo Tagle
SUPER_ADMIN_OWNER_PASSWORD=Kimoeltrading&construction.inc
SUPER_ADMIN_DEVELOPER_EMAIL=leisuarez2@gmail.com
SUPER_ADMIN_DEVELOPER_NAME=Lei Suarez
SUPER_ADMIN_DEVELOPER_PASSWORD=developer123456
```

## Step 5: Deploy Frontend to Render
1. Create another **Web Service**:
   - **Name**: employee-po-frontend
   - **Environment**: Static Site
   - **Plan**: Free
   - **Build Command**: `npm run build`
   - **Publish Directory**: `dist`

## Step 6: Update Frontend API URL
In your vite.config.ts, update the proxy:
```typescript
server: {
  proxy: {
    '/api': {
      target: 'https://employee-po-api.onrender.com',
      changeOrigin: true,
    },
  },
},
```

## Step 7: Initialize Database
Once deployed, run:
```bash
curl https://employee-po-api.onrender.com/api/init
```

## Your Final URLs:
- **Frontend**: https://employee-po-frontend.onrender.com
- **Backend API**: https://employee-po-api.onrender.com
- **Database**: Supabase (always online)

## Benefits:
- ✅ 500MB database storage (vs 256MB on Render)
- ✅ No database sleep (vs 30 min sleep on Render)
- ✅ Better performance
- ✅ Real-time capabilities
- ✅ Easy backup/restore

## Alternative: Vercel + Supabase
If you want even better frontend performance:
- Deploy frontend to Vercel (free, better for React)
- Keep Supabase database
- Backend as Vercel serverless functions
