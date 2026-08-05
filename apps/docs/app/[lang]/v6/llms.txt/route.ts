import { createLlmsRoute } from '@vercel/geistdocs/routes/llms';
import { v6Sources } from '@/lib/geistdocs/source';
import { prefixVersionedMarkdownLinks } from '@/lib/geistdocs/version-markdown';

const llmsRoute = createLlmsRoute({
  sources: v6Sources,
  transform: markdown => prefixVersionedMarkdownLinks(markdown, '/v6'),
});

export const GET = llmsRoute.GET;
export const revalidate = false;
