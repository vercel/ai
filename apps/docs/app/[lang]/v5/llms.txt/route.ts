import { createLlmsRoute } from '@vercel/geistdocs/routes/llms';
import { v5Sources } from '@/lib/geistdocs/source';
import { resolveModelPlaceholders } from '@/lib/geistdocs/model-placeholders';
import { prefixVersionedMarkdownLinks } from '@/lib/geistdocs/version-markdown';

const llmsRoute = createLlmsRoute({
  sources: v5Sources,
  transform: markdown =>
    prefixVersionedMarkdownLinks(resolveModelPlaceholders(markdown), '/v5'),
});

export const GET = llmsRoute.GET;
