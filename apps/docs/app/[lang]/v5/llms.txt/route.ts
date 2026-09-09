import { createLlmsRoute } from '@vercel/geistdocs/routes/llms';
import { v5Sources } from '@/lib/geistdocs/source';
import { prefixVersionedMarkdownLinks } from '@/lib/geistdocs/version-markdown';

const llmsRoute = createLlmsRoute({
  sources: v5Sources,
  transform: markdown => prefixVersionedMarkdownLinks(markdown, '/v5'),
});

export const GET = llmsRoute.GET;
export const revalidate = false;
