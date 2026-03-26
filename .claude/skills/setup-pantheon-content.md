---
name: setup-pantheon-content
description: Set up Pantheon Content Publisher SDK in a Next.js app
tags: [pantheon, cms, nextjs, integration]
---

# Setup Pantheon Content Publisher

This skill sets up the Pantheon Content Publisher React SDK in a Next.js application.

## Prerequisites

- Next.js app with App Router
- Pantheon Content Publisher account with:
  - Site/Collection ID
  - API Token

## Steps

### 1. Install the SDK

```bash
npm install @pantheon-systems/cpub-react-sdk
```

### 2. Configure Environment Variables

Add to `.env`:

```env
NEXT_PUBLIC_PCC_TOKEN="your-token-here"
NEXT_PUBLIC_PCC_SITE_ID="your-site-id-here"
```

Update `src/env.js` (or equivalent env validation file):

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

### 3. Create Pantheon Client

Create `src/lib/pantheon.ts`:

```typescript
import { PantheonClient } from "@pantheon-systems/cpub-react-sdk";
import { env } from "~/env";

export const pantheonClient = new PantheonClient({
  siteId: env.NEXT_PUBLIC_PCC_SITE_ID,
  token: env.NEXT_PUBLIC_PCC_TOKEN,
  debug: process.env.NODE_ENV === "development",
});
```

### 4. Create Provider Component

Create `src/app/_components/pantheon-provider.tsx`:

```typescript
"use client";

import { PantheonProvider } from "@pantheon-systems/cpub-react-sdk";
import { pantheonClient } from "~/lib/pantheon";

export function PantheonClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PantheonProvider client={pantheonClient}>{children}</PantheonProvider>;
}
```

### 5. Add Provider to Layout

Update `src/app/layout.tsx`:

```typescript
import { PantheonClientProvider } from "~/app/_components/pantheon-provider";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html>
      <body>
        <PantheonClientProvider>{children}</PantheonClientProvider>
      </body>
    </html>
  );
}
```

### 6. Create Articles List Page

Create `src/app/articles/page.tsx`:

```typescript
"use client";

import { useArticles } from "@pantheon-systems/cpub-react-sdk";
import Link from "next/link";

export default function ArticlesPage() {
  const result = useArticles();
  const { loading, error, data } = result;

  // Extract articles from the GraphQL response
  const articles = data?.articlesv3?.articles;

  if (loading) {
    return <div>Loading articles...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  return (
    <div>
      <h1>Articles</h1>
      {!articles || articles.length === 0 ? (
        <p>No articles found</p>
      ) : (
        <div>
          {articles.map((article) => (
            <Link key={article.id} href={`/articles/${article.id}`}>
              <h2>{article.title}</h2>
              {article.snippet && <p>{article.snippet}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 7. Create Individual Article Page

Create `src/app/articles/[id]/page.tsx`:

```typescript
"use client";

import { useArticle } from "@pantheon-systems/cpub-react-sdk";
import { useParams } from "next/navigation";
import Link from "next/link";

export default function ArticlePage() {
  const params = useParams();
  const id = params.id as string;
  const result = useArticle(id);
  const { loading, error, data } = result;

  // Extract article from the GraphQL response
  const article = data?.article;

  if (loading) {
    return <div>Loading article...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  if (!article) {
    return <div>Article not found</div>;
  }

  return (
    <div>
      <Link href="/articles">← Back to Articles</Link>
      <h1>{article.title}</h1>
      {article.publishedDate && (
        <p>Published: {new Date(article.publishedDate).toLocaleDateString()}</p>
      )}
      <div dangerouslySetInnerHTML={{ __html: article.content || "" }} />
    </div>
  );
}
```

## Important Notes

### GraphQL Response Structure

The SDK hooks return raw Apollo Client results. Extract data manually:

- `useArticles()` → `data.articlesv3.articles`
- `useArticle(id)` → `data.article`

### API Endpoint

The SDK connects to: `https://gql.prod.pcc.pantheon.io/sites/{siteId}/query`

### Authentication

Uses `PCC-TOKEN` header for authentication.

### Restart Dev Server

After adding environment variables, restart the dev server to load them.

## Testing

1. Start dev server: `npm run dev`
2. Visit `/articles` to see article list
3. Click an article to view its content

## Troubleshooting

**Articles undefined**: Make sure to extract from `data.articlesv3.articles`

**Loading stuck**: Check:
- Environment variables are set
- Dev server restarted after adding env vars
- Token is valid
- Site ID is correct

**Network errors**: Check browser Network tab for failed requests to `gql.prod.pcc.pantheon.io`
