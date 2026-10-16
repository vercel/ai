import { createLlmsRoute } from '@vercel/geistdocs/routes/llms';
import { v6Sources } from '@/lib/geistdocs/source';
import { resolveModelPlaceholders } from '@/lib/geistdocs/model-placeholders';
import { prefixVersionedMarkdownLinks } from '@/lib/geistdocs/version-markdown';

const llmsRoute = createLlmsRoute({
  sources: v6Sources,
  transform: markdown =>
    prefixVersionedMarkdownLinks(resolveModelPlaceholders(markdown), '/v6'),
});

export const GET = llmsRoute.GET;
