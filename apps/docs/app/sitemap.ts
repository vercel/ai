import type { MetadataRoute } from 'next';
import { v7Sources } from '@/lib/geistdocs/source';
import { tools } from '@/lib/tools-registry';

const SITE_URL = 'https://ai-sdk.dev';

export const revalidate = false;

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

export default function sitemap(): MetadataRoute.Sitemap {
  const contentEntries = v7Sources.flatMap(bundle =>
    bundle.source.getPages('en').map(page => ({
      changeFrequency: 'weekly' as const,
      priority: page.url === '/docs/introduction' ? 1 : 0.5,
      url: new URL(page.url, SITE_URL).toString(),
    })),
  );

  const resourceEntries = resourcePaths.map(path => ({
    changeFrequency: 'weekly' as const,
    priority: 0.5,
    url: new URL(path, SITE_URL).toString(),
  }));

  return [...contentEntries, ...resourceEntries];
}
