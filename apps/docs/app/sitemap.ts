import type { MetadataRoute } from 'next';
import { v7Sources } from '@/lib/geistdocs/source';

const SITE_URL = 'https://ai-sdk.dev';

export const revalidate = false;

export default function sitemap(): MetadataRoute.Sitemap {
  return v7Sources.flatMap(bundle =>
    bundle.source.getPages('en').map(page => ({
      changeFrequency: 'weekly' as const,
      priority: page.url === '/docs/introduction' ? 1 : 0.5,
      url: new URL(page.url, SITE_URL).toString(),
    })),
  );
}
