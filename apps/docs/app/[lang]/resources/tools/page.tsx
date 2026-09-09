import { ArrowUpRight } from 'lucide-react';
import type { Metadata } from 'next';
import { socialCard } from '@/lib/og';
import Link from 'next/link';
import { tools } from '@/lib/tools-registry';

export const metadata: Metadata = {
  title: 'AI SDK Tools Registry',
  description:
    'Add powerful functionality to your agents with just a few lines of code.',
  ...socialCard(
    'AI SDK Tools Registry',
    'Add powerful functionality to your agents with just a few lines of code.',
  ),
};

const ToolsPage = () => (
  <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-12 px-8 pb-16">
    <div className="flex flex-col gap-4 pt-12">
      <div className="text-gray-900 text-sm">
        <Link className="hover:underline" href="/resources">
          Resources
        </Link>{' '}
        / Tools Registry
      </div>
      <h1 className="font-semibold text-4xl text-gray-1000 md:text-5xl">
        Tools Registry
      </h1>
      <p className="text-gray-900 text-xl">
        Add powerful functionality to your agents with just a few lines of code.
        These pre-made tools provide everything from web search to extraction
        and more.
      </p>
    </div>

    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {tools.map(tool => (
        <Link
          className="group flex h-full flex-col gap-3 rounded-xl border border-gray-alpha-400 bg-background-100 p-6 transition-all hover:border-gray-500 hover:shadow-sm"
          href={`/resources/tools/${tool.slug}`}
          key={tool.slug}
        >
          <div className="flex items-center justify-between font-semibold text-gray-1000">
            <span>{tool.name}</span>
            <ArrowUpRight
              className="text-gray-700 group-hover:text-gray-1000"
              size={16}
            />
          </div>
          <p className="line-clamp-3 text-gray-900 text-sm leading-6">
            {tool.description}
          </p>
          {tool.tags && tool.tags.length > 0 ? (
            <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
              {tool.tags.map(tag => (
                <span
                  className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-900 text-xs"
                  key={tag}
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </Link>
      ))}
    </div>

    <div className="border-gray-alpha-400 border-t pt-12">
      <div className="flex flex-col items-center rounded-xl border border-gray-alpha-400 p-8 text-center md:p-10">
        <h2 className="mb-3 font-semibold text-2xl text-gray-1000 md:text-3xl">
          Build your own tools
        </h2>
        <p className="mb-6 max-w-2xl text-gray-900">
          Package your functionality and share it with others. Build custom
          tools that anyone can add to their agent in just a few lines of code.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-1000 px-4 py-2 font-medium text-background-100 transition-opacity hover:opacity-90"
            href="https://github.com/vercel-labs/ai-sdk-tool-as-package-template"
            rel="noopener noreferrer"
            target="_blank"
          >
            View template
            <ArrowUpRight size={16} />
          </Link>
          <Link
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-alpha-400 bg-background-100 px-4 py-2 font-medium text-gray-1000 transition-colors hover:border-gray-500"
            href="https://github.com/vercel/ai/blob/main/content/tools-registry/registry.ts"
            rel="noopener noreferrer"
            target="_blank"
          >
            Submit your tool
            <ArrowUpRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  </div>
);

export default ToolsPage;
