import { createDocsMarkdownRoute } from '@vercel/geistdocs/routes/llms';
import { v7Source } from '@/lib/geistdocs/source';
import { resolveModelPlaceholders } from '@/lib/geistdocs/model-placeholders';

const markdownRoute = createDocsMarkdownRoute({
  source: v7Source,
  transform: resolveModelPlaceholders,
});

export const GET = markdownRoute.GET;
export const generateStaticParams = markdownRoute.generateStaticParams;
