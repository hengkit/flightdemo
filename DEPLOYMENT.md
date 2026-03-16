# Deployment Guide

Complete deployment guide for the Pantheon Zero-Downtime Deployment Demo.

## Overview

This application is deployed to Pantheon's Front-End Sites platform using Git tag-based deployments. The platform uses Google Cloud Buildpacks to build and deploy the Next.js application.

## Deployment Flow

```
Dev Environment → Test Environment → Live Environment
     ↓                  ↓                   ↓
  (Auto build)    pantheon_test_N     pantheon_live_N
```

## Prerequisites

Before deploying:

- ✅ Changes committed and pushed to `main` branch
- ✅ Local build tested successfully (`npm run build`)
- ✅ All console errors resolved
- ✅ Features verified locally

## Tag Naming Convention

| Environment | Tag Pattern | Example |
|-------------|-------------|---------|
| Test | `pantheon_test_N` | `pantheon_test_1`, `pantheon_test_2` |
| Live | `pantheon_live_N` | `pantheon_live_1`, `pantheon_live_2` |

**Important:** Tags must be incremental integers following the pattern `pantheon_{env}_{number}`.

## Deploying to Test Environment

### Step 1: Find the Next Tag Number

```bash
# List all test tags
git tag | grep pantheon_test | sort -V

# Get the next number automatically
NEXT_TEST=$(( $(git tag | grep pantheon_test | sed 's/pantheon_test_//' | sort -n | tail -1) + 1 ))
echo "Next test tag: pantheon_test_${NEXT_TEST}"
```

If no tags exist, start with `pantheon_test_1`.

### Step 2: Create and Push the Tag

```bash
# Create the tag on latest main
git tag pantheon_test_${NEXT_TEST}

# Push to deployment remote (triggers Pantheon build)
git push deployment pantheon_test_${NEXT_TEST}

# Also push to origin for tracking
git push origin pantheon_test_${NEXT_TEST}
```

**Critical:** The tag must be pushed to the **deployment** remote to trigger the Pantheon build.

### Step 3: Monitor Deployment

Watch the build progress in the Pantheon dashboard or via Terminus CLI:

```bash
terminus env:info <site>.test
```

### Step 4: Verify Deployment

Once the build completes:

```bash
# Check the application
open https://test-<your-site>.pantheonsite.io/

# Verify cache headers
curl -I https://test-<your-site>.pantheonsite.io/
```

## Deploying to Live Environment

### Step 1: Verify Test Environment

Before deploying to Live, ensure:
- ✅ Application works correctly on Test
- ✅ No console errors
- ✅ All features functional
- ✅ Animations and transitions working smoothly
- ✅ Performance is acceptable

### Step 2: Find the Next Live Tag Number

```bash
# List all live tags
git tag | grep pantheon_live | sort -V

# Get the next number automatically
NEXT_LIVE=$(( $(git tag | grep pantheon_live | sed 's/pantheon_live_//' | sort -n | tail -1) + 1 ))
echo "Next live tag: pantheon_live_${NEXT_LIVE}"
```

### Step 3: Create and Push the Tag

```bash
# Create the tag on latest main
git tag pantheon_live_${NEXT_LIVE}

# Push to deployment remote (triggers Pantheon build)
git push deployment pantheon_live_${NEXT_LIVE}

# Also push to origin for tracking
git push origin pantheon_live_${NEXT_LIVE}
```

### Step 4: Monitor and Verify

```bash
# Monitor deployment
terminus env:info <site>.live

# Verify deployment
open https://live-<your-site>.pantheonsite.io/
```

## Configuration Files

### package.json

Key configurations for Pantheon deployment:

```json
{
  "scripts": {
    "build": "next build",
    "postinstall": "next build"  // Auto-builds after yarn install
  },
  "dependencies": {
    "@pantheon-systems/nextjs-cache-handler": "^0.1.0",
    "@tailwindcss/postcss": "^4",  // Must be in dependencies
    "tailwindcss": "^4"             // Must be in dependencies
  }
}
```

**Why postinstall is critical:** Pantheon runs `yarn install` then `yarn start` without explicitly running `yarn build`. The postinstall script ensures the build happens automatically.

**Why CSS tools are in dependencies:** Google Cloud Buildpacks may run `yarn install --production`, which skips devDependencies. CSS processing requires these at build time.

### next.config.ts

Cache handler configuration:

```typescript
const nextConfig: NextConfig = {
  cacheHandler: require.resolve('./cacheHandler.mjs'),
  cacheMaxMemorySize: 0, // Disable in-memory caching
};
```

### cacheHandler.mjs

Pantheon cache handler for CDN optimization:

```javascript
import { createCacheHandler } from '@pantheon-systems/nextjs-cache-handler';

const CacheHandler = createCacheHandler({
  type: 'auto', // GCS in production, file-based in dev
});

export default CacheHandler;
```

### project.toml

Google Cloud Buildpacks configuration:

```toml
[[build.env]]
name = "NODE_ENV"
value = "production"
```

## Environment Variables

The following environment variables are automatically provided by Pantheon:

| Variable | Purpose | Impact if Missing |
|----------|---------|-------------------|
| `CACHE_BUCKET` | GCS bucket for cache storage | Falls back to file-based caching |
| `OUTBOUND_PROXY_ENDPOINT` | Edge cache proxy endpoint | CDN cache won't clear on deployments |
| `NODE_ENV` | Set to "production" | Build may fail or behave incorrectly |

## Cache Behavior

### On Deployments

When a new build is deployed, the Pantheon cache handler:

1. **Route Cache**: Invalidated - Forces re-rendering with new code
2. **Fetch Cache**: Preserved - Reduces external API calls
3. **Edge/CDN Cache**: Cleared automatically (if `OUTBOUND_PROXY_ENDPOINT` is set)

### Cache Headers

The application sets aggressive cache headers (e.g., `s-maxage=31536000` = 1 year) to maximize CDN efficiency. The cache handler ensures the CDN cache is cleared on deployments, so users always see the latest version.

## Troubleshooting

### Build Fails: "Could not find a production build in the '.next' directory"

**Cause:** No build step ran during deployment.

**Solution:** Ensure `postinstall` script exists in package.json:

```json
{
  "scripts": {
    "postinstall": "next build"
  }
}
```

### Build Fails: "Cannot find module '@tailwindcss/postcss'"

**Cause:** CSS dependencies in devDependencies instead of dependencies.

**Solution:** Move CSS build tools to `dependencies`:

```json
{
  "dependencies": {
    "@tailwindcss/postcss": "^4",
    "tailwindcss": "^4"
  }
}
```

### Build Fails: Turbopack Symlink Errors

**Cause:** Next.js 16 with Turbopack cannot handle symlinked node_modules.

**Solution:** Use Next.js 15.x:

```json
{
  "dependencies": {
    "next": "15.5.12"
  }
}
```

Remove `--turbopack` flag from build script:

```json
{
  "scripts": {
    "build": "next build"  // No --turbopack flag
  }
}
```

### Deployment Not Triggering

**Possible causes:**
- Tag not pushed to `deployment` remote
- Tag doesn't follow naming pattern `pantheon_{env}_{number}`
- Tag doesn't point to a commit in the `main` branch

**Verify:**

```bash
# Check tags on deployment remote
git ls-remote --tags deployment | grep pantheon_test

# Verify tag is on main branch
git tag --contains pantheon_test_1
```

### Old Content Still Showing After Deployment

**Cause:** Browser cache or CDN cache not cleared.

**Solutions:**

1. **Hard refresh browser:** Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
2. **Verify cache handler is working:**
   ```bash
   curl -I https://your-site.pantheonsite.io/ | grep -E "x-nextjs-cache|cache-control"
   ```
3. **Check OUTBOUND_PROXY_ENDPOINT:** Contact Pantheon support if missing

### Tag Already Exists

If you need to recreate a tag:

```bash
# Delete local tag
git tag -d pantheon_test_1

# Delete remote tag
git push origin :refs/tags/pantheon_test_1
git push deployment :refs/tags/pantheon_test_1

# Create new tag
git tag pantheon_test_1
git push origin pantheon_test_1
git push deployment pantheon_test_1
```

## Rollback Procedure

If you need to rollback to a previous deployment:

### Option 1: Create New Tag from Old Commit

```bash
# Find the working commit
git log --oneline

# Create new tag from that commit
git tag pantheon_test_3 <commit-hash>
git push origin pantheon_test_3
git push deployment pantheon_test_3
```

### Option 2: Revert Changes and Redeploy

```bash
# Revert the problematic commits
git revert <commit-hash>
git push origin main
git push deployment main

# Create new deployment tag
git tag pantheon_test_3
git push origin pantheon_test_3
git push deployment pantheon_test_3
```

## Best Practices

1. **Always test build locally before deploying:**
   ```bash
   npm run build
   npm run start
   ```

2. **Deploy to Test first, then Live:**
   - Never skip Test environment
   - Thoroughly verify on Test before Live deployment

3. **Use incremental tag numbers:**
   - Don't reuse tag numbers
   - Keep sequential: 1, 2, 3, etc.

4. **Document deployments:**
   - Add descriptive tag annotations:
     ```bash
     git tag -a pantheon_test_1 -m "Add Step 4 sub-steps and container dimming"
     ```

5. **Monitor deployments:**
   - Watch build logs for errors
   - Verify site immediately after deployment
   - Test all interactive features

## Quick Reference Commands

### Deploy to Test

```bash
# Get next tag number and deploy
NEXT_TEST=$(( $(git tag | grep pantheon_test | sed 's/pantheon_test_//' | sort -n | tail -1) + 1 ))
git tag pantheon_test_${NEXT_TEST}
git push deployment pantheon_test_${NEXT_TEST}
git push origin pantheon_test_${NEXT_TEST}
```

### Deploy to Live

```bash
# Get next tag number and deploy
NEXT_LIVE=$(( $(git tag | grep pantheon_live | sed 's/pantheon_live_//' | sort -n | tail -1) + 1 ))
git tag pantheon_live_${NEXT_LIVE}
git push deployment pantheon_live_${NEXT_LIVE}
git push origin pantheon_live_${NEXT_LIVE}
```

### Verify Deployment

```bash
# Check cache headers
curl -I https://test-<your-site>.pantheonsite.io/

# Test the application
open https://test-<your-site>.pantheonsite.io/
```

## Additional Resources

- [Pantheon Front-End Sites Documentation](https://docs.pantheon.io/guides/decoupled)
- [Next.js Deployment Documentation](https://nextjs.org/docs/deployment)
- [Pantheon Cache Handler](https://www.npmjs.com/package/@pantheon-systems/nextjs-cache-handler)

---

**Last Updated:** 2026-02-14
**Maintained By:** Pantheon Sales Engineering
