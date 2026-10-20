import { createSearchRoute } from '@vercel/geistdocs/routes/search';
import { config } from '@/lib/geistdocs/config';
import { v5Sources, v6Sources, v7Sources } from '@/lib/geistdocs/source';

const v5Search = createSearchRoute({ config, sources: v5Sources });
const v6Search = createSearchRoute({ config, sources: v6Sources });
const v7Search = createSearchRoute({ config, sources: v7Sources });

export const GET = async (request: Request) => {
  const url = new URL(request.url);
  const tag = url.searchParams.get('tag');
  const searches = { v5: v5Search, v6: v6Search, v7: v7Search };

  if (tag === 'v5' || tag === 'v6' || tag === 'v7') {
    // The version scopes the client cache and selects an index. It is not a
    // content tag: passing it to Geistdocs would filter out every result.
    url.searchParams.delete('tag');
    return searches[tag](new Request(url, request));
  }

  // Keep unscoped clients (including WebMCP) compatible with versioned pages.
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
