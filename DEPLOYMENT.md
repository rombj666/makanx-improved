# Deployment Guide

## 1. Database (Neon / PostgreSQL)
- Create a project on [Neon.tech](https://neon.tech).
- Get the `DATABASE_URL` (ensure it's the pooled connection string for serverless environments if needed, though direct is fine for long-running servers).
- Run migrations locally or in the build pipeline:
  ```bash
  cd apps/api
  npx prisma migrate deploy
  ```

## 2. Backend (Render)
- **Type**: Web Service
- **Repo**: Connect your GitHub repo.
- **Root Directory**: `apps/api`
- **Build Command**: `npm install && npx prisma generate && npm run build`
- **Start Command**: `npm start`
- **Environment Variables**:
  - `NODE_ENV`: `production`
  - `DATABASE_URL`: (From Neon)
  - `JWT_SECRET`: (Generate a strong random string)
  - `CLIENT_URL`: `https://your-vercel-app.vercel.app` (Your frontend URL, no trailing slash)
  - `GOOGLE_WEBHOOK_SECRET`: (From your Google Apps Script)
- **Health Check Path**: `/` (returns "MakanX API Running")

**Note on Security**: 
- Rate limiting is enabled. If you get "Too many requests" during testing, check `src/middleware/security.ts`.
- `trust proxy` is enabled for Render's load balancer.

## 3. Frontend (Vercel)
- **Import Project**: Select `apps/web` directory.
- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**:
  - `VITE_API_URL`: `https://your-render-app.onrender.com/api` (Append `/api`)
  - `VITE_SOCKET_URL`: `https://your-render-app.onrender.com` (No `/api`)
- **Rewrites**: A `vercel.json` is included to handle SPA routing.

## 4. Google Apps Script
- Deploy your Apps Script as a Web App.
- Set the `WEBHOOK_URL` to `https://your-render-app.onrender.com/api/webhooks/vendor-application`.
- Set the `SECRET` to match `GOOGLE_WEBHOOK_SECRET` in Render.
