---
name: setup-pantheon-content
description: Set up Pantheon Content Publisher with tRPC in a Next.js app
tags: [pantheon, cms, nextjs, trpc, integration]
---

# Setup Pantheon Content Publisher

This skill sets up Pantheon Content Publisher in a Next.js application using tRPC for server-side queries and the React SDK for client-side features.

## Prerequisites

- Next.js app with App Router
- tRPC set up in the project
- Pantheon Content Publisher account with:
  - Collection ID (for specific collections)
  - API Token

## Steps

### 1. Install the SDK (Optional - for client-side features)

```bash
npm install @pantheon-systems/cpub-react-sdk
```

### 2. Configure Environment Variables

Add to `.env`:

```env
NEXT_PUBLIC_PCC_TOKEN="your-token-here"
NEXT_PUBLIC_PCC_SITE_ID="your-collection-id-here"
```

Update `src/env.js`:

```javascript
client: {
  NEXT_PUBLIC_PCC_TOKEN: z.string(),
  NEXT_PUBLIC_PCC_SITE_ID: z.string(),
},

runtimeEnv: {
  NEXT_PUBLIC_PCC_TOKEN: process.env.NEXT_PUBLIC_PCC_TOKEN,
  NEXT_PUBLIC_PCC_SITE_ID: process.env.NEXT_PUBLIC_PCC_SITE_ID,
},
```

### 3. Create tRPC Articles Router

Create `src/server/api/routers/articles.ts`:

```typescript
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

const COLLECTION_ID = "your-collection-id";
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

let articlesCache: Array<{
  id: string;
  title: string;
  snippet?: string;
  content?: string;
  metadata?: { slug?: string; [key: string]: unknown };
}> | null = null;
let cacheTimestamp = 0;

async function fetchAllArticles() {
  const now = Date.now();
  if (articlesCache && (now - cacheTimestamp) < CACHE_DURATION) {
    return articlesCache;
  }

  const token = process.env.NEXT_PUBLIC_PCC_TOKEN;
  if (!token) return [];

  const query = `
    query ListArticles {
      articlesv3(pageSize: 100, publishingLevel: PRODUCTION) {
        articles {
          id
          title
          snippet
          metadata
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

  const result = await response.json();
  const articles = result.data?.articlesv3?.articles ?? [];
  
  articlesCache = articles.map(article => ({
    ...article,
    content: article.resolvedContent,
  }));
  cacheTimestamp = now;
  
  return articlesCache;
}

export const articlesRouter = createTRPCRouter({
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ input }) => {
      const articles = await fetchAllArticles();
      return articles.find(a => a.metadata?.slug === input.slug) ?? null;
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

Create a component to render Pantheon's JSON content structure:

```typescript
import React from "react";

interface ContentNode {
  tag?: string;
  data?: string | null;
  children?: ContentNode[] | null;
  style?: string[] | null;
  attrs?: Record<string, string> | null;
}

export function ContentRenderer({ content }: { content: string | null }) {
  if (!content) return null;

  let parsed: { children?: ContentNode[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    return <div dangerouslySetInnerHTML={{ __html: content }} />;
  }

  const renderNode = (node: ContentNode, index: number): React.ReactNode => {
    if (node.data && !node.tag) return node.data;
    if (node.tag === "style") return null;

    const Tag = (node.tag || "span") as keyof JSX.IntrinsicElements;
    const styleObj: React.CSSProperties = {};

    if (node.style) {
      node.style.forEach((styleStr) => {
        const [key, value] = styleStr.split(":");
        if (key && value) {
          const camelKey = key.trim().replace(/-([a-z])/g, (g) => g[1]!.toUpperCase());
          styleObj[camelKey as keyof React.CSSProperties] = value.trim() as never;
        }
      });
    }

    const attrs = { ...(node.attrs || {}) };
    if (attrs.class) {
      attrs.className = attrs.class;
      delete attrs.class;
    }

    const props = {
      key: index,
      ...attrs,
      style: Object.keys(styleObj).length > 0 ? styleObj : undefined,
    };

    const children = node.children
      ? node.children.map((child, i) => renderNode(child, i))
      : node.data || null;

    return React.createElement(Tag, props, children);
  };

  return (
    <div className="prose max-w-none">
      {parsed.children?.map((node, i) => renderNode(node, i))}
    </div>
  );
}
```

### 5. Use Articles in Components

```typescript
"use client";

import { api } from "~/trpc/react";
import { ContentRenderer } from "~/components/content-renderer";

export function ArticleDisplay({ slug }: { slug: string }) {
  const { data: article, isLoading } = api.articles.getBySlug.useQuery(
    { slug },
    {
      enabled: !!slug,
      staleTime: 300000, // 5 minutes
    }
  );

  if (isLoading) return <div>Loading...</div>;
  if (!article) return <div>Article not found</div>;

  return (
    <div>
      <h1>{article.title}</h1>
      <ContentRenderer content={article.content} />
    </div>
  );
}
```

## Important Notes

### API Endpoint Structure

- **GraphQL endpoint**: `https://gql.prod.pcc.pantheon.io/sites/{collectionId}/query`
- **Authentication header**: `PCC-TOKEN: your-token`
- **Site ID = Collection ID**: Use your collection ID, not account ID

### Content Structure

Pantheon returns content as JSON tree structure, not HTML. Use the `ContentRenderer` component to properly parse and display it.

### Caching Strategy

- Server-side cache: 5 minutes for all articles
- Client-side staleTime: 5 minutes per query
- Prevents excessive API calls while keeping content fresh

### Metadata Queries

Store custom fields in `metadata` object and query by slug:

```typescript
// In Pantheon CMS, set metadata.slug = "my-article"
// Then query: api.articles.getBySlug({ slug: "my-article" })
```

### GraphQL Query Fields

Available fields:
- `id`, `title`, `snippet`
- `metadata` (custom key-value pairs)
- `resolvedContent` (JSON content structure)
- `publishedDate`, `publishingLevel`
- `tags[]`

## Testing

1. Restart dev server after adding env vars
2. Check GraphQL endpoint in browser network tab
3. Verify `PCC-TOKEN` header is sent
4. Test with: `api.articles.getBySlug.useQuery({ slug: "test" })`

## Troubleshooting

**404 Not Found**: Verify you're using collection ID, not account ID

**Content shows as JSON**: Use `ContentRenderer` component, not `dangerouslySetInnerHTML`

**Articles not found**: Check metadata.slug matches your query exactly

**Class attribute warning**: `ContentRenderer` automatically converts `class` to `className`

**Empty cache**: Check `publishingLevel: PRODUCTION` - unpublished articles won't appear
