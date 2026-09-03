import { createSitemapMarkdownRoute } from '@vercel/geistdocs/routes/sitemap';
import { config } from '@/lib/geistdocs/config';
import {
  cookbookV7Source,
  providersV7Source,
  v7Source,
} from '@/lib/geistdocs/source';

const sitemapRoute = createSitemapMarkdownRoute({
  config,
  sources: [
    { source: v7Source, title: 'Documentation' },
    { source: providersV7Source, title: 'Providers' },
    { source: cookbookV7Source, title: 'Cookbook' },
  ],
  title: 'AI SDK documentation',
});

export const GET = sitemapRoute.GET;
export const generateStaticParams = sitemapRoute.generateStaticParams;
export const revalidate = false;
