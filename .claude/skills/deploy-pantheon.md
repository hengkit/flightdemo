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
- Check `.env.example` for all environment variables your app requires
- API keys for external services:
  - `AISSTREAM_API_KEY` - For ship tracking via WebSocket
  - `N2YO_API_KEY` - For satellite tracking
  - `NEXT_PUBLIC_PCC_TOKEN` - Pantheon Content Publisher token
  - `NEXT_PUBLIC_PCC_SITE_ID` - Pantheon site ID
- Refresh interval configurations (all have defaults)

## API Dependencies

The app integrates with these external services:

### No Authentication Required
- **ADSB.lol** (`https://api.adsb.lol/v2/point/{lat}/{lon}/{radius}`)
  - Real-time aircraft positions (civilian + military)
  - Max 250nm radius per query
  - Server-side cached for 60 seconds
  
- **Aviation Weather Center** (`https://aviationweather.gov/api/data/metar`)
  - METAR weather observations
  - Public API, no key required

- **WordPress API** (`https://live-flightdemo-api.pantheonsite.io/wp-json/wp/v2/aircraft`)
  - Aircraft metadata lookup by ICAO24

### Authentication Required
- **Pantheon Content Publisher** (`https://gql.prod.pcc.pantheon.io`)
  - Airline information via GraphQL
  - Requires `NEXT_PUBLIC_PCC_TOKEN`
  - No server-side caching (fetches fresh each time)

- **AISStream** (`wss://stream.aisstream.io/v0/stream`)
  - Ship tracking via WebSocket
  - Requires `AISSTREAM_API_KEY`
  - Optional feature

- **N2YO** (satellite tracking)
  - Requires `N2YO_API_KEY`
  - Optional feature

## Deployment Steps

### 1. Verify Build Configuration

The project is configured for Pantheon deployment with:
- `next.config.js` - ESLint ignored during builds, WebSocket library externalized
- `tsconfig.json` - JSX namespace properly configured
- `src/types/jsx.d.ts` - TypeScript JSX definitions
- `src/trpc/react.tsx` - Configured to use POST for large batch requests
- All API routers - Timeout handling and resilient error handling

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
   - Main pages load correctly
   - API endpoints respond
   - Dynamic routes work
   - External integrations function

### 5. Monitor for Issues

Watch for:
- **Build errors** in Pantheon logs (TypeScript, webpack, module bundling)
- **Runtime errors** in browser console (503, 414, API failures)
- **API rate limiting** - Check rate limits for external services you're using
- **Missing environment variables** - Check Pantheon dashboard
- **External API failures** - Should degrade gracefully, returning empty data
- **Timeout errors** - May indicate slow external APIs or network issues

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

### Build Error: "b.mask is not a function" (WebSocket)

This error occurs when the `ws` library is improperly bundled by Next.js:

**Fix:**
- Ensure `next.config.js` has webpack config to externalize 'ws':
  ```javascript
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), 'ws'];
    }
    return config;
  }
  ```
- Use lazy initialization for WebSocket connections (on first query, not module load)

### Runtime Error: 414 URI Too Long

This occurs when tRPC batches hundreds of queries into a single GET request:

**Fix:**
- Ensure `src/trpc/react.tsx` has `maxURLLength: 2000` in `httpBatchStreamLink`:
  ```javascript
  httpBatchStreamLink({
    transformer: SuperJSON,
    url: getBaseUrl() + "/api/trpc",
    maxURLLength: 2000, // Forces POST for URLs > 2000 chars
    // ...
  })
  ```
- This automatically switches to POST requests for large batches

### Runtime Error: No Flight Data / 404 from ADSB.lol

**Symptom**: No flight markers showing on map, console shows 404 from ADSB.lol API

**Cause**: Using wrong ADSB.lol endpoint (e.g., `/v2/all` which doesn't exist)

**Fix:**
- Use the correct endpoint: `/v2/point/{lat}/{lon}/{radius}`
- Endpoint is already correct in `src/server/api/routers/flights.ts`
- Verify the endpoint in code:
  ```typescript
  const url = `https://api.adsb.lol/v2/point/${centerLat}/${centerLon}/${radiusNm}`;
  ```
- Maximum radius is 250 nautical miles
- The endpoint returns both civilian and military aircraft

**Available ADSB.lol endpoints:**
- `/v2/point/{lat}/{lon}/{radius}` - Aircraft within radius ✅
- `/v2/mil` - Military aircraft only
- `/v2/hex/{hex}` - Specific aircraft by hex code
- `/v2/all` - ❌ Does NOT exist

### Runtime Error: 503 Service Unavailable

This occurs when external API calls fail or timeout:

**Common causes:**
1. **No timeouts on fetch calls** - Requests hang indefinitely
2. **API errors crash the entire batch** - One failed API breaks all queries

**Fix:**
- All fetch calls should have `signal: AbortSignal.timeout(10000-15000)`
- API handlers should return empty/null instead of throwing errors
- OAuth token failures should fall back to anonymous access

**Verify:**
```bash
# Check that all fetch calls have timeouts
grep -r "fetch(" src/server/api/routers/ | grep -v "timeout"
```

If fetch calls are missing timeouts, add:
```javascript
const response = await fetch(url, {
  signal: AbortSignal.timeout(15000), // 15 second timeout
});
```

### WebSocket Connection Issues

If WebSocket connections don't work in production:
- Pantheon may not support persistent WebSocket connections in all environments
- WebSocket connections should be initialized lazily (on first query, not build time)
- Check logs for WebSocket connection messages
- Consider using polling or alternative real-time solutions if WebSockets are unsupported

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

## Common Deployment Issues & Solutions

### Quick Diagnostic Steps

1. **Check build logs** - Look for TypeScript, webpack, or dependency errors
2. **Test locally** - Run `npm run build` to reproduce build issues
3. **Check browser console** - Look for 414, 503, or timeout errors
4. **Check server logs** - Look for API errors, timeouts, or WebSocket issues
5. **Verify environment variables** - Ensure all required vars are set

### Error Patterns

| Error | Cause | Solution |
|-------|-------|----------|
| `Cannot find namespace 'JSX'` | Missing TypeScript definitions | Add `src/types/jsx.d.ts` |
| `b.mask is not a function` | WebSocket library bundling | Externalize 'ws' in webpack config |
| `414 URI Too Long` | Too many batched queries | Add `maxURLLength: 2000` to tRPC |
| `503 Service Unavailable` | API timeouts or errors | Add timeouts, return empty on error |
| `404` from ADSB.lol | Wrong API endpoint | Use `/v2/point/{lat}/{lon}/{radius}` |
| No flight markers | ADSB.lol endpoint error | Check endpoint in flights router |
| `articles.map is not a function` | Wrong data structure | Extract `data.articlesv3.articles` |
| Build succeeds but runtime fails | Environment variables | Check Pantheon dashboard env vars |

## Performance Considerations

- **API caching**: 
  - Client-side caching via React Query (stale time configured per query)
  - No server-side caching for Pantheon Content Publisher articles (fetches fresh on every request)
  - Flight data cached server-side for 60 seconds
  - Configure `NEXT_PUBLIC_*_STALE_TIME` and `NEXT_PUBLIC_*_REFETCH_INTERVAL` as needed
- **Rate limits**: 
  - ADSB.lol: No authentication required, check for rate limiting if experiencing issues
  - AISStream: Requires API key, check WebSocket connection stability
  - N2YO: Requires API key for satellite data
  - Pantheon Content Publisher: No rate limits observed, but fetches on every request
  - Aviation Weather: Public API, no authentication
- **Recommended timeout values**:
  - OAuth/authentication tokens: 10s
  - Data fetching APIs: 15s
  - Quick lookups: 10s
  - Adjust based on API performance and requirements
- **Error handling**: APIs should degrade gracefully, returning empty/null data on failure

## Notes

- Google Cloud Buildpacks automatically detects Next.js and installs dependencies
- Build output is cached between deployments for faster builds
- Static assets are automatically optimized and served via CDN
- Server-side rendering (SSR) is supported for dynamic routes
- External API failures won't crash the app - data degrades gracefully
