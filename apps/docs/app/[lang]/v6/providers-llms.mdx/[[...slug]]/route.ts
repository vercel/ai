import { createDocsMarkdownRoute } from '@vercel/geistdocs/routes/llms';
import { providersV6Source } from '@/lib/geistdocs/source';
import { prefixVersionedMarkdownLinks } from '@/lib/geistdocs/version-markdown';

const markdownRoute = createDocsMarkdownRoute({
  source: providersV6Source,
  transform: markdown => prefixVersionedMarkdownLinks(markdown, '/v6'),
});

export const GET = markdownRoute.GET;
export const generateStaticParams = markdownRoute.generateStaticParams;
export const revalidate = false;
