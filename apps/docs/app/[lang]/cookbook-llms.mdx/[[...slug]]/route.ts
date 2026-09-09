import { createDocsMarkdownRoute } from '@vercel/geistdocs/routes/llms';
import { cookbookV7Source } from '@/lib/geistdocs/source';

const markdownRoute = createDocsMarkdownRoute({ source: cookbookV7Source });

export const GET = markdownRoute.GET;
export const generateStaticParams = markdownRoute.generateStaticParams;
export const revalidate = false;
