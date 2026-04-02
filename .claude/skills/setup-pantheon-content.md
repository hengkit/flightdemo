---
name: setup-pantheon-content
description: Set up Pantheon Content Publisher with tRPC and React SDK in Next.js
tags: [pantheon, cms, nextjs, trpc, integration]
---

# Setup Pantheon Content Publisher

This skill sets up Pantheon Content Publisher in a Next.js application using both tRPC for server-side caching and the React SDK for client-side features.

## Prerequisites

- Next.js app with App Router
- tRPC set up in the project
- Pantheon Content Publisher account with:
  - Site ID (from Pantheon dashboard)
  - Collection ID (the actual collection you're querying)
  - API Token (PCC-TOKEN)

## Steps

### 1. Install the React SDK

```bash
npm install @pantheon-systems/cpub-react-sdk
```

### 2. Configure Environment Variables

Add to `.env`:

```env
# Required
NEXT_PUBLIC_PCC_TOKEN="your-token-here"
NEXT_PUBLIC_PCC_SITE_ID="your-site-id-here"

# Optional - defaults provided
NEXT_PUBLIC_PCC_COLLECTION_ID="your-collection-id-here"
ARTICLES_CACHE_DURATION=60000  # Server-side cache (ms)
NEXT_PUBLIC_ARTICLES_STALE_TIME=60000  # Client-side stale time (ms)
```

Update `src/env.js`:

```javascript
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]),
    ARTICLES_CACHE_DURATION: z.coerce.number().default(60000),
  },
  client: {
    NEXT_PUBLIC_PCC_TOKEN: z.string(),
    NEXT_PUBLIC_PCC_SITE_ID: z.string(),
    NEXT_PUBLIC_PCC_COLLECTION_ID: z.string().optional(),
    NEXT_PUBLIC_ARTICLES_STALE_TIME: z.coerce.number().default(60000),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    ARTICLES_CACHE_DURATION: process.env.ARTICLES_CACHE_DURATION,
    NEXT_PUBLIC_PCC_TOKEN: process.env.NEXT_PUBLIC_PCC_TOKEN,
    NEXT_PUBLIC_PCC_SITE_ID: process.env.NEXT_PUBLIC_PCC_SITE_ID,
    NEXT_PUBLIC_PCC_COLLECTION_ID: process.env.NEXT_PUBLIC_PCC_COLLECTION_ID,
    NEXT_PUBLIC_ARTICLES_STALE_TIME: process.env.NEXT_PUBLIC_ARTICLES_STALE_TIME,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
```

### 3. Create tRPC Articles Router (Server-Side with Caching)

Create `src/server/api/routers/articles.ts`:

```typescript
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { env } from "~/env";

// Your collection ID from Pantheon
const COLLECTION_ID = "your-collection-id";

// Server-side cache
let articlesCache: Array<{
  id: string;
  title: string;
  snippet?: string;
  content?: string;
  tags?: string[];
  publishedDate?: string;
  metadata?: { slug?: string; [key: string]: unknown };
}> | null = null;
let cacheTimestamp = 0;

async function fetchAllArticles() {
  const now = Date.now();

  // Return cached articles if still fresh
  if (articlesCache && (now - cacheTimestamp) < env.ARTICLES_CACHE_DURATION) {
    return articlesCache;
  }

  const token = process.env.NEXT_PUBLIC_PCC_TOKEN;

  if (!token) {
    console.error("Missing Pantheon token");
    return [];
  }

  try {
    // GraphQL query for articles
    const query = `
      query ListArticles {
        articlesv3(
          pageSize: 100
          publishingLevel: PRODUCTION
        ) {
          articles {
            id
            title
            snippet
            metadata
            tags
            publishedDate
            resolvedContent
          }
        }
      }
    `;

    const response = await fetch(
      `https://gql.prod.pcc.pantheon.io/sites/${COLLECTION_ID}/query`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "PCC-TOKEN": token,
        },
        body: JSON.stringify({ query }),
      }
    );

    if (!response.ok) {
      console.error(`Failed to fetch articles: ${response.status} ${response.statusText}`);
      // Return stale cache on error
      return articlesCache ?? [];
    }

    const result = await response.json() as {
      data?: {
        articlesv3?: {
          articles?: Array<{
            id: string;
            title: string;
            snippet?: string;
            resolvedContent?: string;
            tags?: string[];
            publishedDate?: string;
            metadata?: Record<string, unknown>;
          }>;
        };
      };
    };

    const articles = result.data?.articlesv3?.articles ?? [];

    // Map resolvedContent to content for consistency
    articlesCache = articles.map(article => ({
      ...article,
      content: article.resolvedContent,
    }));

    cacheTimestamp = now;

    console.log(`Cached ${articlesCache.length} articles from collection`);

    return articlesCache;
  } catch (error) {
    console.error("Error fetching articles:", error);
    // Return stale cache on error
    return articlesCache ?? [];
  }
}

export const articlesRouter = createTRPCRouter({
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ input }) => {
      const articles = await fetchAllArticles();

      // Find article by slug in metadata
      const article = articles.find(
        (a) => a.metadata?.slug === input.slug
      );

      return article ?? null;
    }),
});
```

Register the router in `src/server/api/root.ts`:

```typescript
import { articlesRouter } from "~/server/api/routers/articles";

export const appRouter = createTRPCRouter({
  // ... other routers
  articles: articlesRouter,
});
```

### 4. Create Content Renderer Component

Create a component to render Pantheon's JSON content structure (inline or as separate component):

```typescript
import React from "react";

interface ContentNode {
  tag?: string;
  data?: string | null;
  children?: ContentNode[] | null;
  style?: string[] | null;
  attrs?: Record<string, string> | null;
}

interface ContentStructure {
  version?: string;
  children?: ContentNode[];
}

export function ContentRenderer({ content }: { content: string | null | undefined }) {
  if (!content) return null;

  // Try to parse as JSON
  let parsedContent: ContentStructure;
  try {
    parsedContent = JSON.parse(content) as ContentStructure;
  } catch {
    // If not JSON, render as HTML (fallback)
    return <div dangerouslySetInnerHTML={{ __html: content }} />;
  }

  const renderNode = (node: ContentNode, index: number): React.ReactNode => {
    // If it's just text data
    if (node.data && !node.tag) {
      return node.data;
    }

    // Skip style tags
    if (node.tag === "style") {
      return null;
    }

    const Tag = (node.tag || "span") as keyof JSX.IntrinsicElements;
    const styleObj: React.CSSProperties = {};

    // Parse inline styles
    if (node.style) {
      node.style.forEach((styleStr) => {
        const [key, value] = styleStr.split(":");
        if (key && value) {
          const camelKey = key.trim().replace(/-([a-z])/g, (g) => g[1]!.toUpperCase());
          styleObj[camelKey as keyof React.CSSProperties] = value.trim() as never;
        }
      });
    }

    // Build props and convert class to className for React
    const attrs = { ...(node.attrs || {}) };
    if (attrs.class) {
      attrs.className = attrs.class;
      delete attrs.class;
    }

    const props: Record<string, unknown> = {
      key: index,
      ...attrs,
      style: Object.keys(styleObj).length > 0 ? styleObj : undefined,
    };

    // Render children
    const children = node.children
      ? node.children.map((child, i) => renderNode(child, i))
      : node.data || null;

    return React.createElement(Tag, props, children);
  };

  return (
    <div className="prose max-w-none">
      {parsedContent.children?.map((node, i) => renderNode(node, i))}
    </div>
  );
}
```

### 5. Use Articles in Components

#### Option A: Server-Side (tRPC with Caching)

```typescript
"use client";

import { api } from "~/trpc/react";
import { ContentRenderer } from "~/components/content-renderer";
import { env } from "~/env";

export function ArticleDisplay({ slug }: { slug: string }) {
  const { data: article, isLoading } = api.articles.getBySlug.useQuery(
    { slug },
    {
      enabled: !!slug,
      staleTime: env.NEXT_PUBLIC_ARTICLES_STALE_TIME,
    }
  );

  if (isLoading) return <div>Loading...</div>;
  if (!article) return <div>Article not found</div>;

  return (
    <div>
      <h1>{article.title}</h1>
      {article.tags && article.tags.length > 0 && (
        <div className="flex gap-2">
          {article.tags.map((tag) => (
            <span key={tag} className="rounded bg-gray-200 px-2 py-1 text-sm">
              {tag}
            </span>
          ))}
        </div>
      )}
      <ContentRenderer content={article.content} />
    </div>
  );
}
```

#### Option B: Client-Side (React SDK Direct)

```typescript
"use client";

import { useArticle } from "@pantheon-systems/cpub-react-sdk";
import { ContentRenderer } from "~/components/content-renderer";

interface ArticleWithContent {
  id: string;
  title: string;
  content?: string;
  body?: string;
  tags?: string[];
  publishedDate?: string;
  metadata?: Record<string, unknown>;
}

export function ArticleDisplay({ id }: { id: string }) {
  const { loading, error, data } = useArticle(id);

  // Extract article from the GraphQL response
  const article = data?.article as ArticleWithContent | undefined;

  if (loading) return <div>Loading article...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!article) return <div>Article not found</div>;

  return (
    <article>
      <h1>{article.title}</h1>
      
      {article.tags && article.tags.length > 0 && (
        <div className="flex gap-2">
          {article.tags.map((tag) => (
            <span key={tag} className="rounded bg-gray-200 px-2 py-1 text-sm">
              {tag}
            </span>
          ))}
        </div>
      )}

      {article.publishedDate && (
        <div className="text-sm text-gray-600">
          Published: {new Date(article.publishedDate).toLocaleDateString()}
        </div>
      )}

      <ContentRenderer content={article.content} />
    </article>
  );
}
```

#### Option C: List All Articles (React SDK)

```typescript
"use client";

import { useArticles } from "@pantheon-systems/cpub-react-sdk";
import Link from "next/link";

interface Article {
  id: string;
  title: string;
  tags?: string[];
}

export function ArticlesList() {
  const { loading, error, data } = useArticles();

  // The data object may have articles nested within it
  const articles = Array.isArray(data)
    ? data
    : (data as { articles?: Article[] } | undefined)?.articles;

  if (loading) return <div>Loading articles...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!articles || articles.length === 0) return <div>No articles found</div>;

  return (
    <div className="grid gap-4">
      {articles.map((article) => (
        <Link
          key={article.id}
          href={`/articles/${article.id}`}
          className="block rounded-lg border p-4 hover:bg-gray-50"
        >
          <h2 className="text-xl font-bold">{article.title}</h2>
          {article.tags && article.tags.length > 0 && (
            <div className="mt-2 flex gap-2">
              {article.tags.map((tag) => (
                <span key={tag} className="rounded bg-gray-200 px-2 py-1 text-sm">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </Link>
      ))}
    </div>
  );
}
```

## Important Notes

### API Endpoint Structure

- **GraphQL endpoint**: `https://gql.prod.pcc.pantheon.io/sites/{collectionId}/query`
- **Authentication header**: `PCC-TOKEN: your-token`
- **CRITICAL**: Use your **Collection ID**, not Site ID or Account ID
  - Collection ID is found in Pantheon dashboard for the specific collection
  - Site ID is for SDK configuration (client-side)
  - These are different values!

### Content Structure

Pantheon returns content as a **JSON tree structure**, not HTML:
- Each node has `tag`, `data`, `children`, `style`, `attrs`
- The `ContentRenderer` component recursively parses this into React elements
- **Do NOT** use `dangerouslySetInnerHTML` directly on Pantheon content
- `resolvedContent` field contains the JSON structure

### Caching Strategy

**Two-tier caching for optimal performance:**

1. **Server-side cache** (in-memory):
   - Duration: `ARTICLES_CACHE_DURATION` (default: 60 seconds)
   - Shared across all requests
   - Returns stale cache on API errors (graceful degradation)

2. **Client-side cache** (React Query):
   - Stale time: `NEXT_PUBLIC_ARTICLES_STALE_TIME` (default: 60 seconds)
   - Per-component cache
   - Automatic background refetching

**Benefits:**
- Reduces API calls dramatically
- Fast response times (server cache is instant)
- Resilient to API failures (stale-while-revalidate pattern)

### Metadata Queries

Custom fields are stored in the `metadata` object:

```typescript
// In Pantheon CMS, add custom metadata:
// metadata.slug = "united-airlines"
// metadata.iataCode = "UA"
// metadata.region = "North America"

// Query by slug:
api.articles.getBySlug({ slug: "united-airlines" })

// Access metadata in component:
article.metadata?.iataCode // "UA"
```

### GraphQL Query Fields

Available in `articlesv3` query:
- **Core**: `id`, `title`, `snippet`
- **Content**: `resolvedContent` (JSON structure), `body` (plain text)
- **Metadata**: `metadata` (custom key-value pairs), `tags[]`
- **Dates**: `publishedDate`, `updatedDate`, `createdDate`
- **Publishing**: `publishingLevel` (`PRODUCTION`, `DRAFT`, etc.)

### React SDK vs tRPC

**Use React SDK (useArticles, useArticle)** when:
- You want direct client-side access
- Building purely client-side features
- Don't need server-side caching

**Use tRPC** when:
- You want server-side caching
- Need to aggregate multiple data sources
- Want type-safe server-client communication
- Need custom business logic before returning data

## Testing

1. **Restart dev server** after adding environment variables
2. Check browser network tab for:
   - GraphQL requests to `gql.prod.pcc.pantheon.io`
   - `PCC-TOKEN` header is present
   - Response data structure
3. Test tRPC endpoint: `api.articles.getBySlug.useQuery({ slug: "test" })`
4. Check server console for cache logs: `Cached X articles from collection`
5. Verify article content renders (not showing JSON)

## Troubleshooting

### 404 Not Found on GraphQL endpoint

**Cause**: Using wrong Collection ID

**Fix**: 
- Verify you're using the **Collection ID**, not Site ID or Account ID
- Find Collection ID in Pantheon dashboard under your collection
- Update `COLLECTION_ID` constant in `articles.ts`

### Content displays as raw JSON

**Cause**: Not using ContentRenderer component

**Fix**:
```typescript
// ❌ Wrong
<div dangerouslySetInnerHTML={{ __html: article.content }} />

// ✅ Correct
<ContentRenderer content={article.content} />
```

### Articles not found / empty array

**Possible causes**:
1. Wrong collection ID
2. No articles published to PRODUCTION
3. Token doesn't have access to collection
4. Network/API error

**Debugging**:
```typescript
// Add logging to fetchAllArticles()
console.log("API Response:", result);
console.log("Articles count:", result.data?.articlesv3?.articles?.length);
```

### "articles.map is not a function" error

**Cause**: `useArticles()` returns data in different structure than expected

**Fix**:
```typescript
// Handle both array and nested object
const articles = Array.isArray(data)
  ? data
  : (data as { articles?: Article[] })?.articles;
```

### React "class" attribute warning

**Cause**: Pantheon content uses HTML `class` attribute

**Fix**: Already handled in ContentRenderer (auto-converts to `className`)

### Stale content showing

**Cause**: Server cache hasn't expired

**Fix**:
- Reduce `ARTICLES_CACHE_DURATION` for dev
- Clear cache: restart server
- Or modify cache to check timestamps

### Empty results but articles exist in Pantheon

**Causes**:
1. Articles are in `DRAFT`, not `PRODUCTION` publishing level
2. Wrong collection being queried
3. Token permissions issue

**Fix**: Check `publishingLevel: PRODUCTION` in GraphQL query

## Advanced: Custom Endpoints

Add more tRPC procedures for specific queries:

```typescript
export const articlesRouter = createTRPCRouter({
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ input }) => {
      const articles = await fetchAllArticles();
      return articles.find((a) => a.metadata?.slug === input.slug) ?? null;
    }),
  
  getByTag: publicProcedure
    .input(z.object({ tag: z.string().min(1) }))
    .query(async ({ input }) => {
      const articles = await fetchAllArticles();
      return articles.filter((a) => a.tags?.includes(input.tag));
    }),
    
  getAll: publicProcedure
    .query(async () => {
      return await fetchAllArticles();
    }),
});
```

## Bonus: MCP Server Integration

This project includes a Pantheon Content Publisher MCP server for Claude Code development:

### Available MCP Tools

- `mcp__content-publisher__search_articles` - Search articles by keywords
- `mcp__content-publisher__get_article` - Get article by ID
- `mcp__content-publisher__create_article` - Create new article
- `mcp__content-publisher__update_document_metadata` - Update article metadata
- `mcp__content-publisher__authenticate` - Authenticate with Pantheon

### Setup MCP Server

Add to `.claude/mcp.json`:

```json
{
  "mcpServers": {
    "content-publisher": {
      "command": "npx",
      "args": [
        "-y",
        "@pantheon-systems/cpub-mcp-server"
      ],
      "env": {
        "PANTHEON_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Usage with Claude Code

Claude Code can now directly interact with your Pantheon content:

```
User: "Search for articles about United Airlines"
Claude: <uses mcp__content-publisher__search_articles>

User: "Update the metadata for article ID abc123"
Claude: <uses mcp__content-publisher__update_document_metadata>
```

This is useful for:
- Content management during development
- Bulk updates to article metadata
- Searching and discovering content
- Creating test articles
