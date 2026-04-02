import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

// Collection ID for airlines
const AIRLINES_COLLECTION_ID = "OwnBC7jAu8wdPC0vyQz7";

async function fetchAllArticles() {
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
      return [];
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
    const mappedArticles = articles.map(article => ({
      ...article,
      content: article.resolvedContent,
    }));

    console.log(`Fetched ${mappedArticles.length} articles from airlines collection`);

    return mappedArticles;
  } catch (error) {
    console.error("Error fetching articles:", error);
    return [];
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
