import { createSearchRoute } from '@vercel/geistdocs/routes/search';
import { config } from '@/lib/geistdocs/config';
import { v5Sources, v6Sources, v7Sources } from '@/lib/geistdocs/source';

const v5Search = createSearchRoute({ config, sources: v5Sources });
const v6Search = createSearchRoute({ config, sources: v6Sources });
const v7Search = createSearchRoute({ config, sources: v7Sources });

export const GET = async (request: Request) => {
  const referer = request.headers.get('referer');
  let search = v7Search;
  if (referer) {
    try {
      const pathname = new URL(referer).pathname;
      search = pathname.startsWith('/v5/')
        ? v5Search
        : pathname.startsWith('/v6/')
          ? v6Search
          : v7Search;
    } catch {
      // Invalid or synthetic Referer headers fall back to current docs search.
    }
  }
  const response = await search(request);
  response.headers.append('Vary', 'Referer');
  return response;
};
