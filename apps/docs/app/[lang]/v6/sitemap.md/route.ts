import { createSitemapMarkdownRoute } from '@vercel/geistdocs/routes/sitemap';
import { config } from '@/lib/geistdocs/config';
import {
  cookbookV6Source,
  providersV6Source,
  v6Source,
} from '@/lib/geistdocs/source';

const sitemapRoute = createSitemapMarkdownRoute({
  config,
  sources: [
    { source: v6Source, title: 'Documentation' },
    { source: providersV6Source, title: 'Providers' },
    { source: cookbookV6Source, title: 'Cookbook' },
  ],
  title: 'AI SDK v6 documentation',
});

export const GET = sitemapRoute.GET;
export const generateStaticParams = sitemapRoute.generateStaticParams;
export const revalidate = false;
