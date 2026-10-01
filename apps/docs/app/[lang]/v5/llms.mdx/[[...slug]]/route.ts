import { createDocsMarkdownRoute } from '@vercel/geistdocs/routes/llms';
import { v5Source } from '@/lib/geistdocs/source';
import { resolveModelPlaceholders } from '@/lib/geistdocs/model-placeholders';
import { prefixVersionedMarkdownLinks } from '@/lib/geistdocs/version-markdown';

const markdownRoute = createDocsMarkdownRoute({
  source: v5Source,
  transform: markdown =>
    prefixVersionedMarkdownLinks(resolveModelPlaceholders(markdown), '/v5'),
});

export const GET = markdownRoute.GET;
export const generateStaticParams = markdownRoute.generateStaticParams;
