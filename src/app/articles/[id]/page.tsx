"use client";

import { useArticle } from "@pantheon-systems/cpub-react-sdk";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function ArticlePage() {
  const params = useParams();
  const id = params.id as string;
  const result = useArticle(id);
  const { loading, error, data } = result;

  // Extract article from the GraphQL response
  const article = data?.article;

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
        <div className="text-xl">Loading article...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
        <div className="max-w-2xl rounded-lg bg-red-900/50 p-8 text-red-200">
          <h1 className="mb-4 text-2xl font-bold">Error loading article</h1>
          <p>{error.message}</p>
          <Link
            href="/articles"
            className="mt-4 inline-block rounded-lg bg-white/10 px-4 py-2 transition hover:bg-white/20"
          >
            Back to Articles
          </Link>
        </div>
      </main>
    );
  }

  if (!article) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
        <div className="max-w-2xl rounded-lg bg-white/10 p-8">
          <h1 className="mb-4 text-2xl font-bold">Article not found</h1>
          <Link
            href="/articles"
            className="inline-block rounded-lg bg-white/10 px-4 py-2 transition hover:bg-white/20"
          >
            Back to Articles
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#2e026d] to-[#15162c] p-8 text-white">
      <div className="container mx-auto max-w-4xl">
        <div className="mb-8">
          <Link
            href="/articles"
            className="inline-block rounded-lg bg-white/10 px-4 py-2 transition hover:bg-white/20"
          >
            ← Back to Articles
          </Link>
        </div>

        <article className="rounded-lg bg-white/10 p-8">
          <h1 className="mb-6 text-4xl font-extrabold">{article.title}</h1>

          {article.tags && article.tags.length > 0 && (
            <div className="mb-6 flex gap-2">
              {article.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-white/20 px-3 py-1 text-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {article.publishedDate && (
            <div className="mb-6 text-sm text-gray-300">
              Published:{" "}
              {new Date(article.publishedDate).toLocaleDateString()}
            </div>
          )}

          <div
            className="prose prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: article.content || "" }}
          />

          {article.metadata && (
            <div className="mt-8 rounded-lg bg-white/5 p-4">
              <h2 className="mb-2 text-xl font-bold">Metadata</h2>
              <pre className="overflow-auto text-xs">
                {JSON.stringify(article.metadata, null, 2)}
              </pre>
            </div>
          )}
        </article>
      </div>
    </main>
  );
}
