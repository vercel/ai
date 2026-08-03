import { createDocsMarkdownRoute } from '@vercel/geistdocs/routes/llms';
import { providersV6Source } from '@/lib/geistdocs/source';

const markdownRoute = createDocsMarkdownRoute({ source: providersV6Source });

export const GET = markdownRoute.GET;
export const generateStaticParams = markdownRoute.generateStaticParams;
export const revalidate = false;
