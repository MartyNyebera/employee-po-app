# Deploy to Vercel + Supabase (Alternative Free Option)

## 1. Setup Supabase Database
- Go to https://supabase.com
- Create new project (free)
- Get your DATABASE_URL from Supabase settings

## 2. Deploy to Vercel
- Install Vercel CLI: `npm i -g vercel`
- Run: `vercel` in your project folder
- Connect to your GitHub repo

## 3. Add Environment Variables in Vercel
```
DATABASE_URL=your-supabase-database-url
JWT_SECRET=your-jwt-secret
SUPER_ADMIN_OWNER_EMAIL=kimoel_leotagle@yahoo.com
SUPER_ADMIN_OWNER_NAME=Leo Tagle
SUPER_ADMIN_OWNER_PASSWORD=Kimoeltrading&construction.inc
```

## 4. Update API Calls
Make sure your frontend uses relative URLs (already configured in vite.config.ts)

## 5. Deploy
```bash
vercel --prod
```

## Benefits of Vercel + Supabase:
- ✅ Unlimited frontend bandwidth
- ✅ 100GB serverless function calls/month
- ✅ 500MB database storage
- ✅ Auto-scaling
- ✅ GitHub auto-deploys

## Your URLs:
- **App**: `https://your-app-name.vercel.app`
- **Database**: Managed by Supabase
