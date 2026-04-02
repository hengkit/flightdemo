"use client";

import { useArticles } from "@pantheon-systems/cpub-react-sdk";
import Link from "next/link";

interface Article {
  id: string;
  title: string;
  tags?: string[];
}

export default function ArticlesPage() {
  const result = useArticles();
  const { loading, error, data } = result;

  // Extract articles from the GraphQL response
  // The data object may have articles nested within it
  const articles = Array.isArray(data)
    ? data
    : (data as { articles?: Article[] } | undefined)?.articles;

  console.log("Articles result:", { articles, loading, error, data, isArray: Array.isArray(data) });

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
        <div className="text-xl">Loading articles...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
        <div className="max-w-2xl rounded-lg bg-red-900/50 p-8 text-red-200">
          <h1 className="mb-4 text-2xl font-bold">Error loading articles</h1>
          <p>{error.message}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#2e026d] to-[#15162c] p-8 text-white">
      <div className="container mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-4xl font-extrabold">Airlines</h1>
          <Link
            href="/"
            className="rounded-lg bg-white/10 px-4 py-2 transition hover:bg-white/20"
          >
            Back to Map
          </Link>
        </div>

        {!articles || articles.length === 0 ? (
          <div className="rounded-lg bg-white/10 p-8">
            <p className="mb-4 text-xl">No articles found</p>
            <div className="text-left">
              <p className="mb-2 font-bold">Debug Info:</p>
              <pre className="overflow-auto rounded bg-black/30 p-4 text-xs">
                {JSON.stringify({
                  articles,
                  loading,
                  error: error ? { message: (error as Error).message, name: (error as Error).name } : null,
                  data: data
                }, null, 2)}
              </pre>
              <p className="mt-4 text-sm">Check browser console for full details</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            {articles.map((article: { id: string; title: string; tags?: string[] }) => (
              <Link
                key={article.id}
                href={`/articles/${article.id}`}
                className="block rounded-lg bg-white/10 p-6 transition hover:bg-white/20"
              >
                <h2 className="text-2xl font-bold">{article.title}</h2>
                {article.tags && article.tags.length > 0 && (
                  <div className="mt-2 flex gap-2">
                    {article.tags.map((tag: string) => (
                      <span
                        key={tag}
                        className="rounded bg-white/20 px-2 py-1 text-sm"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
