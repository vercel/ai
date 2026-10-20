import {
  IconFileText,
  IconMessage,
  IconSparkles,
  IconWrench,
} from '@vercel/geistdocs/assets/icons';
import { IconArrowUpRight } from '@vercel/geistdocs/assets/icons/icon-arrow-up-right';
import { LogoNextjs, LogoSvelteKit } from '@vercel/geistdocs/assets/logos';
import Link from 'next/link';
import { type ReactNode, useId } from 'react';
import {
  LogoExpo,
  NodeIcon,
  NuxtIcon,
} from '@/components/docs/framework-icons';

type ResolveHref = (href: string) => string;

const LOGO_SIZE = 64;

/**
 * Quickstart templates, ported from the legacy
 * `apps/studio/components/docs/frameworks-quickstart.tsx`. `color` is the
 * brand hex (without `#`) used for the card's radial glow.
 */
const quickstarts: {
  color: string;
  href: string;
  logo: ReactNode;
  title: string;
}[] = [
  {
    title: 'Next.js App Router',
    href: '/docs/getting-started/nextjs-app-router',
    logo: <LogoNextjs className="text-gray-1000" height={LOGO_SIZE} />,
    color: '000000',
  },
  {
    title: 'Next.js Pages Router',
    href: '/docs/getting-started/nextjs-pages-router',
    logo: <LogoNextjs className="text-gray-1000" height={LOGO_SIZE} />,
    color: '000000',
  },
  {
    title: 'SvelteKit',
    href: '/docs/getting-started/svelte',
    logo: <LogoSvelteKit className="text-[#FF3E00]" height={LOGO_SIZE} />,
    color: 'FF3E00',
  },
  {
    title: 'Nuxt',
    href: '/docs/getting-started/nuxt',
    logo: <NuxtIcon size={LOGO_SIZE} />,
    color: '00DC82',
  },
  {
    title: 'Node.js',
    href: '/docs/getting-started/nodejs',
    logo: <NodeIcon size={LOGO_SIZE} />,
    color: '72B954',
  },
  {
    title: 'Expo',
    href: '/docs/getting-started/expo',
    logo: (
      <span className="text-gray-1000">
        <LogoExpo size={LOGO_SIZE} />
      </span>
    ),
    color: '72B954',
  },
];

/**
 * Support entries with production copy
 * (`apps/studio/components/docs/support.tsx`). Icons map to the closest
 * Geistdocs glyphs: bug -> wrench, sparkles -> sparkles, question -> message,
 * terminal -> file-text.
 */
const supportItems = [
  {
    title: 'Report Issues',
    description:
      "Found a bug? We'd love to hear about it in our GitHub issues.",
    icon: <IconWrench size={16} />,
    button: {
      label: 'Open GitHub Issue',
      href: 'https://github.com/vercel/ai/issues/new?assignees=&labels=&projects=&template=1.bug_report.yml',
    },
  },
  {
    title: 'Feature Requests',
    description:
      'Want to suggest a new feature? Share it with us and the community.',
    icon: <IconSparkles size={16} />,
    button: {
      label: 'Request Feature',
      href: 'https://github.com/vercel/ai/issues/new?assignees=&labels=&projects=&template=2.feature_request.yml',
    },
  },
  {
    title: 'Ask the Community',
    description:
      'Join our GitHub discussions to browse for help and best practices.',
    icon: <IconMessage size={16} />,
    button: {
      label: 'Ask a question',
      href: 'https://github.com/vercel/ai/discussions',
    },
  },
  {
    title: 'Migration Guides',
    description:
      'Check out our migration guides to help you upgrade to the latest version.',
    icon: <IconFileText size={16} />,
    button: {
      label: 'Migration Guides',
      href: '/docs/migration-guides',
    },
  },
];

const isExternalHref = (href: string) => href.startsWith('https://');

/**
 * Link card with a logo well over a subtle radial brand glow (legacy
 * `FrameworkCard` in `apps/studio/components/docs/card.jsx`).
 */
const FrameworkCard = ({
  children,
  color,
  href,
  title,
}: {
  children: ReactNode;
  color: string;
  href: string;
  title: string;
}) => {
  const glowId = `${useId().replace(/:/g, '')}-glow`;

  return (
    <Link
      className="relative flex flex-col overflow-hidden rounded-lg border border-gray-alpha-400 bg-background-100 p-4 text-gray-1000 shadow-sm transition-all hover:border-gray-alpha-600 hover:shadow-lg hover:shadow-gray-alpha-100 focus-visible:ring-2 focus-visible:ring-blue-700"
      href={href}
      // Fully prefetch static docs pages so navigation never shows a shell.
      prefetch
    >
      <svg
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 size-full"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        <defs>
          <radialGradient id={glowId}>
            <stop offset="0%" stopColor={`#${color}19`} />
            <stop offset="100%" stopColor={`#${color}00`} />
          </radialGradient>
        </defs>
        <ellipse cx="50%" cy="0%" fill={`url(#${glowId})`} rx="54%" ry="20%" />
      </svg>
      <div className="z-10 flex h-40 items-center justify-center pt-8">
        {children}
      </div>
      <p className="z-10 mt-2 font-medium leading-tight">{title}</p>
    </Link>
  );
};

export const QuickstartFrameworkCards = ({
  resolveHref = href => href,
}: {
  resolveHref?: ResolveHref;
}) => (
  <div className="not-prose grid grid-cols-1 gap-4 sm:grid-cols-2">
    {quickstarts.map(({ color, href, logo, title }) => (
      <FrameworkCard
        color={color}
        href={resolveHref(href)}
        key={title}
        title={title}
      >
        {logo}
      </FrameworkCard>
    ))}
  </div>
);

export const Support = ({
  resolveHref = href => href,
}: {
  resolveHref?: ResolveHref;
}) => (
  <div className="not-prose grid grid-cols-1 gap-4">
    {supportItems.map(item => {
      const href = resolveHref(item.button.href);
      const external = isExternalHref(href);

      return (
        <div
          className="flex flex-col justify-between gap-4 rounded-lg border border-gray-alpha-400 p-4"
          key={item.title}
        >
          <div className="flex flex-col gap-1">
            <div className="flex flex-row items-center gap-3 font-medium text-gray-1000">
              <span aria-hidden className="text-gray-700">
                {item.icon}
              </span>
              {item.title}
            </div>
            <p className="text-gray-900">{item.description}</p>
          </div>
          <Link
            className="flex w-full flex-row items-center justify-between gap-2 rounded-md bg-gray-1000 px-3 py-2 text-background-100 transition-colors hover:bg-gray-900 focus-visible:ring-2 focus-visible:ring-blue-700"
            href={href}
            prefetch={external ? undefined : true}
            rel={external ? 'noopener noreferrer' : undefined}
            target={external ? '_blank' : undefined}
          >
            <span>{item.button.label}</span>
            <span aria-hidden>
              <IconArrowUpRight size={16} />
            </span>
          </Link>
        </div>
      );
    })}
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
  <section className="not-prose flex h-full flex-col rounded-lg border border-gray-alpha-400 p-5 shadow-sm transition-shadow hover:shadow-lg hover:shadow-gray-alpha-100">
    <div className="flex min-h-48 flex-1 items-center justify-center overflow-hidden">
      {children}
    </div>
    <h3 className="mt-3 font-semibold text-gray-1000 text-lg">{title}</h3>
    {description ? (
      <p className="mt-1 text-gray-900 text-sm leading-5">{description}</p>
    ) : null}
  </section>
);
