import { createSearchRoute } from '@vercel/geistdocs/routes/search';
import { config } from '@/lib/geistdocs/config';
import { v6Source, v7Source } from '@/lib/geistdocs/source';

const stableSearch = createSearchRoute({ config, source: v6Source });
const canarySearch = createSearchRoute({ config, source: v7Source });

export const GET = async (request: Request) => {
  const referer = request.headers.get('referer');
  let isCanary = false;
  if (referer) {
    try {
      isCanary = new URL(referer).pathname.startsWith('/v7/');
    } catch {
      // Invalid or synthetic Referer headers fall back to stable docs search.
    }
  }
  const response = await (isCanary ? canarySearch : stableSearch)(request);
  response.headers.append('Vary', 'Referer');
  return response;
};
