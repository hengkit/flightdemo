---
name: deploy-pantheon
description: Deploy the Next.js app to Pantheon hosting with Google Cloud Buildpacks
tags: [pantheon, deployment, production, buildpacks]
---

# Deploy to Pantheon

This skill deploys your Next.js application to Pantheon using Google Cloud Buildpacks.

## Pre-deployment Checklist

Before deploying, ensure:

1. **TypeScript compiles without errors**
   ```bash
   npm run typecheck
   ```

2. **Production build succeeds**
   ```bash
   npm run build
   ```

3. **All changes are committed**
   - Commit any uncommitted changes
   - Push to remote repository

4. **Environment variables are configured**
   - Verify all required env vars are set in Pantheon dashboard
   - Check `.env.example` for reference

## Required Environment Variables

Ensure these are set in Pantheon's environment configuration:

### Required:
- `NODE_ENV=production`

### Optional (based on features used):
- `OPENSKY_CLIENT_ID` - OpenSky Network OAuth2 client ID
- `OPENSKY_CLIENT_SECRET` - OpenSky Network OAuth2 secret
- `AISSTREAM_API_KEY` - AISStream API key for ship tracking
- `N2YO_API_KEY` - N2YO API key for satellite tracking
- `NEXT_PUBLIC_PCC_TOKEN` - Pantheon Content Publisher token
- `NEXT_PUBLIC_PCC_SITE_ID` - Pantheon Content Publisher site ID

## Deployment Steps

### 1. Verify Build Configuration

The project is configured for Pantheon deployment with:
- `next.config.js` - ESLint ignored during builds
- `tsconfig.json` - JSX namespace properly configured
- `src/types/jsx.d.ts` - TypeScript JSX definitions

### 2. Test Production Build Locally

Run the build command to ensure it completes without errors:

```bash
npm run build
```

If there are errors:
- Fix TypeScript errors first (run `npm run typecheck`)
- Address any build-time issues
- Re-commit and test again

### 3. Deploy to Pantheon

Pantheon supports multiple deployment methods:

#### Option A: Git Push (if configured)
```bash
git push pantheon main
```

#### Option B: Pantheon Dashboard
1. Go to Pantheon dashboard
2. Navigate to your site
3. Go to "Code" tab
4. Connect GitHub repository (if not already connected)
5. Deploy from the `main` branch

#### Option C: Pantheon CLI (terminus)
```bash
# Install terminus CLI if not already installed
# See: https://pantheon.io/docs/terminus/install

# Deploy from git
terminus build:env:push <site>.<env>
```

### 4. Verify Deployment

After deployment:
1. Check build logs in Pantheon dashboard
2. Verify the site loads at your Pantheon URL
3. Test key features:
   - Flight map loads
   - API endpoints respond
   - Articles load (if using Pantheon Content Publisher)

### 5. Monitor for Issues

Watch for:
- Build errors in Pantheon logs
- Runtime errors in browser console
- API rate limiting issues
- Missing environment variables

## Troubleshooting

### Build Fails with "Cannot find namespace 'JSX'"

This should be fixed, but if it occurs:
- Ensure `src/types/jsx.d.ts` exists
- Verify `tsconfig.json` has `"jsxImportSource": "react"`
- Check that `@types/react` is installed

### Build Fails with ESLint Errors

The project is configured to ignore ESLint during builds via `next.config.js`:
```javascript
eslint: {
  ignoreDuringBuilds: true,
}
```

If you want to fix ESLint errors instead, remove this config and run:
```bash
npm run lint:fix
```

### Missing Environment Variables

If APIs aren't working:
1. Check Pantheon dashboard → Environment Variables
2. Verify variable names match exactly (case-sensitive)
3. Restart the application after adding variables

### WebSocket Connection Issues

If ship tracking (AISStream) doesn't work:
- Pantheon may not support persistent WebSocket connections in all environments
- Consider disabling ship tracking in production or using polling instead

## Post-Deployment

After successful deployment:

1. **Set up monitoring** - Add error tracking (Sentry, LogRocket, etc.)
2. **Configure domain** - Point custom domain to Pantheon site
3. **Enable HTTPS** - Pantheon provides free SSL certificates
4. **Set up CI/CD** - Automate deployments from GitHub

## Rollback

If deployment fails:

1. **Pantheon Dashboard**: Use the "Code" tab to deploy a previous commit
2. **Git**: Force push a previous commit
   ```bash
   git push pantheon <commit-hash>:main --force
   ```

## Notes

- Google Cloud Buildpacks automatically detects Next.js and installs dependencies
- Build output is cached between deployments for faster builds
- Static assets are automatically optimized and served via CDN
- Server-side rendering (SSR) is supported for dynamic routes
