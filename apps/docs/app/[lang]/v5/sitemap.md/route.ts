import { createSitemapMarkdownRoute } from '@vercel/geistdocs/routes/sitemap';
import { config } from '@/lib/geistdocs/config';
import {
  cookbookV5Source,
  providersV5Source,
  v5Source,
} from '@/lib/geistdocs/source';

const sitemapRoute = createSitemapMarkdownRoute({
  config,
  sources: [
    { source: v5Source, title: 'Documentation' },
    { source: providersV5Source, title: 'Providers' },
    { source: cookbookV5Source, title: 'Cookbook' },
  ],
  title: 'AI SDK v5 documentation',
});

export const GET = sitemapRoute.GET;
export const generateStaticParams = sitemapRoute.generateStaticParams;
export const revalidate = false;
