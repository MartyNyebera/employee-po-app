# Deploy with Neon Database (3GB Storage - Most Generous)

## Why Neon:
- ✅ **3GB storage** (12x more than Render)
- ✅ **100GB bandwidth/month**
- ✅ **Serverless** (instant scaling)
- ✅ **No cold starts**
- ✅ **Auto-scaling**
- ✅ **Branching for development**

## Step 1: Setup Neon Database
1. Go to https://neon.tech
2. Click "Sign up" → Continue with GitHub
3. Create new project:
   - **Project name**: employee-po-app
   - **Database name**: fleet_manager
   - **Region**: Choose closest to you
4. Copy the connection string

## Step 2: Choose Your Hosting

### Option A: Render (Easy)
- Frontend: Render Static Site (free)
- Backend: Render Web Service (free)
- Database: Neon (3GB)

### Option B: Vercel (Better for React)
- Frontend: Vercel (free, unlimited bandwidth)
- Backend: Vercel serverless functions
- Database: Neon (3GB)

## Step 3: Deploy Backend (Render Example)
1. Create Web Service on Render
2. Environment variables:
```
NODE_ENV=production
DATABASE_URL=your-neon-connection-string
JWT_SECRET=kimoel-employee-po-secret-key-2024
SUPER_ADMIN_OWNER_EMAIL=kimoel_leotagle@yahoo.com
SUPER_ADMIN_OWNER_NAME=Leo Tagle
SUPER_ADMIN_OWNER_PASSWORD=Kimoeltrading&construction.inc
```

## Step 4: Deploy Frontend
- Build: `npm run build`
- Deploy to Render or Vercel

## Storage Comparison:
| Service | Storage | Sleep Time | Cost |
|---------|---------|------------|------|
| Render DB | 256MB | 30 min | Free |
| Supabase | 500MB | Never | Free |
| **Neon** | **3GB** | **Never** | **Free** |

## Neon Benefits:
- ✅ Most generous free tier
- ✅ No sleep (always online)
- ✅ Serverless technology
- ✅ Auto-backups
- ✅ Branching (dev/test environments)

## Your Setup:
- **Database**: Neon (3GB, always online)
- **Frontend**: Render/Vercel (free)
- **Backend**: Render/Vercel (free)
- **Total cost**: $0
- **Performance**: Excellent
