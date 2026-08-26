import type { MetadataRoute } from 'next';
import { cacheLife } from 'next/cache';
import { absoluteUrl } from '@/lib/geistdocs/site-url';
import { v7Sources } from '@/lib/geistdocs/source';
import { tools } from '@/lib/tools-registry';

// Resource pages listed by the production sitemap. Recipe detail pages stay
// on their canonical /cookbook URLs, and /resources/templates is absent to
// match production.
const resourcePaths = [
  '/resources',
  '/resources/recipes',
  '/resources/tools',
  ...tools.map(tool => `/resources/tools/${tool.slug}`),
  '/resources/showcase',
];

// oxlint-disable-next-line require-await -- Next.js requires cached functions to be async.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  'use cache';
  cacheLife('max');

  const contentEntries = v7Sources.flatMap(bundle =>
    bundle.source.getPages('en').map(page => ({
      changeFrequency: 'weekly' as const,
      priority: page.url === '/docs/introduction' ? 1 : 0.5,
      url: absoluteUrl(page.url),
    })),
  );

  const resourceEntries = resourcePaths.map(path => ({
    changeFrequency: 'weekly' as const,
    priority: 0.5,
    url: absoluteUrl(path),
  }));

  return [...contentEntries, ...resourceEntries];
}
