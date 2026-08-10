import type { GeistdocsConfig } from '@vercel/geistdocs/config';

export const title = 'AI SDK';

export const Logo = () => (
  <span className="font-semibold text-gray-1000">AI SDK</span>
);

// Production nests these under a Resources dropdown; the dropdown is a
// follow-up, so a flat item links to the /resources hub (which links to
// Recipes, the Tools Registry, Templates, and the Showcase).
export const nav: NonNullable<GeistdocsConfig['nav']> = [
  { label: 'Docs', href: '/docs' },
  { label: 'Resources', href: '/resources' },
  { label: 'Providers', href: '/providers' },
];

export const content: NonNullable<GeistdocsConfig['content']> = [
  { id: 'v7', label: 'v7', dir: 'content/v7/docs', route: '/docs' },
  {
    id: 'v6',
    label: 'v6',
    dir: 'content/v6/docs',
    route: '/v6/docs',
  },
  {
    id: 'v5',
    label: 'v5',
    dir: 'content/v5/docs',
    route: '/v5/docs',
  },
  {
    id: 'providers-v7',
    label: 'Providers (v7)',
    dir: 'content/v7/providers',
    route: '/providers',
  },
  {
    id: 'providers-v6',
    label: 'Providers (v6)',
    dir: 'content/v6/providers',
    route: '/v6/providers',
  },
  {
    id: 'providers-v5',
    label: 'Providers (v5)',
    dir: 'content/v5/providers',
    route: '/v5/providers',
  },
  {
    id: 'cookbook-v7',
    label: 'Cookbook (v7)',
    dir: 'content/v7/cookbook',
    route: '/cookbook',
  },
  {
    id: 'cookbook-v6',
    label: 'Cookbook (v6)',
    dir: 'content/v6/cookbook',
    route: '/v6/cookbook',
  },
  {
    id: 'cookbook-v5',
    label: 'Cookbook (v5)',
    dir: 'content/v5/cookbook',
    route: '/v5/cookbook',
  },
];

export const versions: NonNullable<GeistdocsConfig['versions']> = {
  current: 'v7',
  items: [
    {
      id: 'v7',
      label: 'v7',
      description: 'Latest documentation',
      routePrefix: '',
    },
    {
      id: 'v6',
      label: 'v6',
      description: 'v6 maintenance documentation',
      routePrefix: '/v6',
    },
    {
      id: 'v5',
      label: 'v5',
      description: 'v5 maintenance documentation',
      routePrefix: '/v5',
    },
  ],
};

export const translations = {
  en: { displayName: 'English' },
};
