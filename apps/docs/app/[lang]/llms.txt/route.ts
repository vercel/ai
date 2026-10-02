import { createLlmsRoute } from '@vercel/geistdocs/routes/llms';
import { v7Sources } from '@/lib/geistdocs/source';
import { resolveModelPlaceholders } from '@/lib/geistdocs/model-placeholders';

const llmsRoute = createLlmsRoute({
  sources: v7Sources,
  transform: resolveModelPlaceholders,
});

export const GET = llmsRoute.GET;
