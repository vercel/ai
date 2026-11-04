import type { MetadataRoute } from 'next';
import { absoluteUrl, siteUrl } from '@/lib/geistdocs/site-url';

const PRODUCTION_ORIGIN = 'https://ai-sdk.dev';

export default function robots(): MetadataRoute.Robots {
  const isProduction =
    process.env.VERCEL_ENV === 'production' &&
    // The canonical domain may be transferred after this deployment is built.
    siteUrl.origin === PRODUCTION_ORIGIN;

  if (!isProduction) {
    return {
      rules: { userAgent: '*', disallow: '/' },
    };
  }

  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
