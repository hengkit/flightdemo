import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { env } from "~/env";

// Collection ID for airlines
const AIRLINES_COLLECTION_ID = "OwnBC7jAu8wdPC0vyQz7";

// Cache for articles
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
    // Use the GraphQL API endpoint
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
      `https://gql.prod.pcc.pantheon.io/sites/${AIRLINES_COLLECTION_ID}/query`,
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
