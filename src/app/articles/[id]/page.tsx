"use client";

import { useArticle } from "@pantheon-systems/cpub-react-sdk";
import Link from "next/link";
import { useParams } from "next/navigation";
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

function ContentRenderer({ content }: { content: string | null | undefined }) {
  if (!content) return null;

  // Try to parse as JSON
  let parsedContent: ContentStructure;
  try {
    parsedContent = JSON.parse(content) as ContentStructure;
  } catch {
    // If not JSON, render as HTML
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
    <div className="prose prose-invert max-w-none">
      {parsedContent.children?.map((node, i) => renderNode(node, i))}
    </div>
  );
}

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

          <ContentRenderer content={article.content} />

          {article.metadata && Object.keys(article.metadata).length > 0 && (
            <div className="mt-8 rounded-lg bg-white/5 p-6">
              <h2 className="mb-4 text-xl font-bold">Metadata</h2>
              <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {Object.entries(article.metadata).map(([key, value]) => (
                  <div key={key} className="rounded-lg bg-white/5 p-4">
                    <dt className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">
                      {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim()}
                    </dt>
                    <dd className="text-base text-white">
                      {typeof value === 'object' && value !== null
                        ? JSON.stringify(value, null, 2)
                        : String(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </article>
      </div>
    </main>
  );
}
