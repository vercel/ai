import { createDocsMarkdownRoute } from '@vercel/geistdocs/routes/llms';
import { providersV5Source } from '@/lib/geistdocs/source';
import { prefixVersionedMarkdownLinks } from '@/lib/geistdocs/version-markdown';

const markdownRoute = createDocsMarkdownRoute({
  source: providersV5Source,
  transform: markdown => prefixVersionedMarkdownLinks(markdown, '/v5'),
});

export const GET = markdownRoute.GET;
export const generateStaticParams = markdownRoute.generateStaticParams;
export const revalidate = false;
