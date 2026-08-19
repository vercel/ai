import Link from 'next/link';
import type { ReactNode } from 'react';

type ResolveHref = (href: string) => string;

const quickstarts = [
  ['Next.js App Router', '/docs/getting-started/nextjs-app-router'],
  ['Next.js Pages Router', '/docs/getting-started/nextjs-pages-router'],
  ['SvelteKit', '/docs/getting-started/svelte'],
  ['Nuxt', '/docs/getting-started/nuxt'],
  ['Node.js', '/docs/getting-started/nodejs'],
  ['Expo', '/docs/getting-started/expo'],
] as const;

const supportItems = [
  {
    title: 'Report an Issue',
    description: 'Share a reproducible bug report with the maintainers.',
    href: 'https://github.com/vercel/ai/issues/new?template=1.bug_report.yml',
  },
  {
    title: 'Request a Feature',
    description: 'Propose an improvement for the SDK or documentation.',
    href: 'https://github.com/vercel/ai/issues/new?template=2.feature_request.yml',
  },
  {
    title: 'Ask the Community',
    description: 'Browse discussions and ask implementation questions.',
    href: 'https://github.com/vercel/ai/discussions',
  },
  {
    title: 'Migration Guides',
    description: 'Upgrade an application between AI SDK versions.',
    href: '/docs/migration-guides',
  },
] as const;

const CardLink = ({
  description,
  href,
  title,
}: {
  description?: string;
  href: string;
  title: string;
}) => (
  <Link
    className="flex min-w-0 flex-col gap-1 rounded-lg border border-gray-alpha-400 p-4 text-gray-1000 transition-colors hover:border-gray-alpha-600 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-blue-700"
    href={href}
  >
    <span className="font-medium">{title}</span>
    {description ? (
      <span className="text-gray-900 text-sm leading-5">{description}</span>
    ) : null}
  </Link>
);

export const QuickstartFrameworkCards = ({
  resolveHref = href => href,
}: {
  resolveHref?: ResolveHref;
}) => (
  <div className="not-prose grid grid-cols-1 gap-4 sm:grid-cols-2">
    {quickstarts.map(([title, href]) => (
      <CardLink href={resolveHref(href)} key={title} title={title} />
    ))}
  </div>
);

export const Support = ({
  resolveHref = href => href,
}: {
  resolveHref?: ResolveHref;
}) => (
  <div className="not-prose grid grid-cols-1 gap-4 sm:grid-cols-2">
    {supportItems.map(item => (
      <CardLink {...item} href={resolveHref(item.href)} key={item.title} />
    ))}
  </div>
);

export const Card = ({
  children,
  description,
  title,
}: {
  children?: ReactNode;
  description?: string;
  title: string;
}) => (
  <section className="not-prose flex h-full flex-col rounded-lg border border-gray-alpha-400 p-5">
    <div className="flex min-h-48 flex-1 items-center justify-center overflow-hidden">
      {children}
    </div>
    <h3 className="mt-3 font-semibold text-gray-1000 text-lg">{title}</h3>
    {description ? (
      <p className="mt-1 text-gray-900 text-sm leading-5">{description}</p>
    ) : null}
  </section>
);
