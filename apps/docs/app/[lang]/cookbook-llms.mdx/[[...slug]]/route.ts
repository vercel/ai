import { createDocsMarkdownRoute } from '@vercel/geistdocs/routes/llms';
import { cookbookV7Source } from '@/lib/geistdocs/source';
import { resolveModelPlaceholders } from '@/lib/geistdocs/model-placeholders';

const markdownRoute = createDocsMarkdownRoute({
  source: cookbookV7Source,
  transform: resolveModelPlaceholders,
});

export const GET = markdownRoute.GET;
export const generateStaticParams = markdownRoute.generateStaticParams;
