import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

// Collection ID for airlines
const AIRLINES_COLLECTION_ID = "OwnBC7jAu8wdPC0vyQz7";

// Cache for articles - refresh every 5 minutes
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
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function fetchAllArticles() {
  const now = Date.now();

  // Return cached articles if still fresh
  if (articlesCache && (now - cacheTimestamp) < CACHE_DURATION) {
    return articlesCache;
  }

  // Fetch from Pantheon Content Publisher API
  const siteId = process.env.NEXT_PUBLIC_PCC_SITE_ID;
  const token = process.env.NEXT_PUBLIC_PCC_TOKEN;

  if (!siteId || !token) {
    console.error("Missing Pantheon credentials");
    return [];
  }

  // Simple query without complex filters
  const query = `
    query {
      articlesv3(
        limit: 100
      ) {
        articles {
          id
          title
          snippet
          content
          tags
          publishedDate
          metadata
          siteId
        }
      }
    }
  `;

  try {
    const response = await fetch(
      `https://api.content.pantheon.io/api/v1/${siteId}/graphql`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query }),
      }
    );

    if (!response.ok) {
      console.error(`Failed to fetch articles: ${response.statusText}`);
      return articlesCache ?? [];
    }

    const result = await response.json() as {
      data?: {
        articlesv3?: {
          articles?: Array<{
            id: string;
            title: string;
            snippet?: string;
            content?: string;
            tags?: string[];
            publishedDate?: string;
            metadata?: Record<string, unknown>;
            siteId?: string;
          }>;
        };
      };
    };

    // Filter to only airlines collection articles
    const allArticles = result.data?.articlesv3?.articles ?? [];
    articlesCache = allArticles.filter(a => a.siteId === AIRLINES_COLLECTION_ID);
    cacheTimestamp = now;

    console.log(`Cached ${articlesCache.length} articles from airlines collection`);

    return articlesCache;
  } catch (error) {
    console.error("Error fetching articles:", error);
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
