import type { GeistdocsConfig } from '@vercel/geistdocs/config';

export const title = 'AI SDK';

export const Logo = () => (
  <span className="font-semibold text-gray-1000">AI SDK</span>
);

export const nav: NonNullable<GeistdocsConfig['nav']> = [
  { label: 'Docs', href: '/docs' },
  { label: 'Providers', href: '/providers' },
];

export const content: NonNullable<GeistdocsConfig['content']> = [
  { id: 'v6', label: 'v6', dir: 'content/v6/docs', route: '/docs' },
  {
    id: 'v7',
    label: 'v7',
    dir: 'content/v7/docs',
    route: '/v7/docs',
  },
  {
    id: 'providers-v6',
    label: 'Providers (v6)',
    dir: 'content/v6/providers',
    route: '/providers',
  },
  {
    id: 'providers-v7',
    label: 'Providers (v7)',
    dir: 'content/v7/providers',
    route: '/v7/providers',
  },
];

export const versions: NonNullable<GeistdocsConfig['versions']> = {
  current: 'v6',
  items: [
    {
      id: 'v6',
      label: 'v6',
      description: 'v6 documentation',
      routePrefix: '',
    },
    {
      id: 'v7',
      label: 'v7',
      description: 'Latest documentation',
      routePrefix: '/v7',
    },
  ],
};

export const translations = {
  en: { displayName: 'English' },
};
