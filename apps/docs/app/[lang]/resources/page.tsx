import { ArrowUpRight, Box, Code, Sparkles, Star } from 'lucide-react';
import type { Metadata } from 'next';
import { socialCard } from '@/lib/og';
import Link from 'next/link';
import { getRecipes } from '@/lib/recipes';
import { showcaseProjects } from '@/lib/showcase';
import { tools } from '@/lib/tools-registry';

export const metadata: Metadata = {
  title: 'AI SDK Resources',
  description:
    'Explore AI SDK recipes, tools, templates, and products from Vercel and the community.',
  ...socialCard(
    'AI SDK Resources',
    'Explore AI SDK recipes, tools, templates, and products from Vercel and the community.',
  ),
};

const templateGroups = [
  'Starter kits',
  'Feature exploration',
  'Frameworks',
  'Generative UI',
  'Security',
];

const featuredLinks = [
  {
    title: 'Submit a tool',
    description: 'Add an AI SDK tool package to the registry through GitHub.',
    href: 'https://github.com/vercel/ai/blob/main/contributing/add-new-tool-to-registry.md',
  },
  {
    title: 'Add your product',
    description: 'Share a product built with the AI SDK for the showcase.',
    href: 'https://github.com/vercel/ai/discussions/1914',
  },
];

const ResourcesPage = () => {
  const recipeCount = getRecipes('v7').length;

  const resourceCards = [
    {
      title: 'Recipes',
      description:
        'Build specific AI SDK features with focused MDX recipes and runnable examples.',
      href: '/resources/recipes',
      meta: `${recipeCount} recipes`,
      icon: <Code size={18} />,
    },
    {
      title: 'Tools Registry',
      description:
        'Browse community-built tools that add web search, extraction, code execution, and more.',
      href: '/resources/tools',
      meta: `${tools.length} tools`,
      icon: <Box size={18} />,
    },
    {
      title: 'Templates',
      description:
        'Start from official app templates, examples, and framework integrations.',
      href: '/resources/templates',
      meta: `${templateGroups.length} groups`,
      icon: <Sparkles size={18} />,
    },
    {
      title: 'Showcase',
      description:
        'See popular products and projects built with the AI SDK for proof and inspiration.',
      href: '/resources/showcase',
      meta: `${showcaseProjects.length} projects`,
      icon: <Star size={18} />,
    },
  ];

  return (
    <main className="w-full px-4 pb-20 md:px-8">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-12 pt-10 md:pt-16">
        <section className="relative overflow-hidden rounded-3xl border border-gray-alpha-400 bg-background-100 p-6 md:p-10">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(113,113,122,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(113,113,122,0.12)_1px,transparent_1px)] bg-[size:28px_28px] opacity-60" />
          <div className="relative flex max-w-3xl flex-col gap-5">
            <div className="w-fit rounded-full border border-gray-alpha-400 bg-background-100 px-3 py-1 text-gray-900 text-sm shadow-sm">
              AI SDK Resources
            </div>
            <div className="flex flex-col gap-4">
              <h1 className="max-w-2xl font-semibold text-4xl text-gray-1000 tracking-tight md:text-6xl">
                Find what you need to build with the AI SDK.
              </h1>
              <p className="max-w-2xl text-gray-900 text-lg leading-8 md:text-xl">
                Explore recipes, tools, templates, and real products from Vercel
                and the AI SDK community.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-alpha-400 bg-background-100 px-4 py-2 font-medium text-gray-1000 transition-colors hover:border-gray-500"
                href="https://github.com/vercel/ai"
                rel="noopener noreferrer"
                target="_blank"
              >
                Contribute on GitHub
                <ArrowUpRight size={16} />
              </Link>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {resourceCards.map(card => (
            <Link
              className="group hover:-translate-y-0.5 rounded-2xl border border-gray-alpha-400 bg-background-100 p-6 transition-all hover:border-gray-500 hover:shadow-sm"
              href={card.href}
              key={card.href}
            >
              <div className="flex items-start justify-between gap-6">
                <div className="flex flex-col gap-4">
                  <div className="flex size-10 items-center justify-center rounded-xl border border-gray-alpha-400 bg-gray-100 text-gray-1000">
                    {card.icon}
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-2xl text-gray-1000 tracking-tight">
                        {card.title}
                      </h2>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-900 text-xs">
                        {card.meta}
                      </span>
                    </div>
                    <p className="max-w-xl text-gray-900 leading-7">
                      {card.description}
                    </p>
                  </div>
                </div>
                <ArrowUpRight
                  className="group-hover:-translate-y-0.5 mt-1 text-gray-700 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-1000"
                  size={18}
                />
              </div>
            </Link>
          ))}
        </section>

        <section className="grid grid-cols-1 gap-4 border-gray-alpha-400 border-t pt-10 md:grid-cols-2">
          {featuredLinks.map(link => (
            <Link
              className="group flex items-start justify-between gap-6 rounded-2xl border border-gray-alpha-400 p-6 transition-colors hover:border-gray-500"
              href={link.href}
              key={link.href}
              rel="noopener noreferrer"
              target="_blank"
            >
              <div className="flex flex-col gap-2">
                <h2 className="font-semibold text-gray-1000 text-xl">
                  {link.title}
                </h2>
                <p className="text-gray-900 leading-7">{link.description}</p>
              </div>
              <ArrowUpRight
                className="group-hover:-translate-y-0.5 mt-1 shrink-0 text-gray-700 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-1000"
                size={18}
              />
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
};

export default ResourcesPage;
