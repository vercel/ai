import { createSearchRoute } from '@vercel/geistdocs/routes/search';
import { config } from '@/lib/geistdocs/config';
import {
  loadSearchSources,
  type SearchVersion,
} from '@/lib/geistdocs/search-sources';

type Search = ReturnType<typeof createSearchRoute>;

// Creating a search route builds its indexes, which takes seconds per version
// on a cold function instance. Build each version on its first request so a
// search only waits for the version it asks for.
const searches = new Map<SearchVersion, Promise<Search>>();

const getSearch = (version: SearchVersion) => {
  let search = searches.get(version);
  if (!search) {
    search = loadSearchSources(version).then(sources =>
      createSearchRoute({ config, sources }),
    );
    // Let the next request retry instead of caching a failed load.
    search.catch(() => searches.delete(version));
    searches.set(version, search);
  }
  return search;
};

export const GET = async (request: Request) => {
  const url = new URL(request.url);
  const tag = url.searchParams.get('tag');

  if (tag === 'v5' || tag === 'v6' || tag === 'v7') {
    // The version scopes the client cache and selects an index. It is not a
    // content tag: passing it to Geistdocs would filter out every result.
    url.searchParams.delete('tag');
    const search = await getSearch(tag);
    return search(new Request(url, request));
  }

  // Keep unscoped clients (including WebMCP) compatible with versioned pages.
  const referer = request.headers.get('referer');
  let version: SearchVersion = 'v7';
  if (referer) {
    try {
      const pathname = new URL(referer).pathname;
      version = pathname.startsWith('/v5/')
        ? 'v5'
        : pathname.startsWith('/v6/')
          ? 'v6'
          : 'v7';
    } catch {
      // Invalid or synthetic Referer headers fall back to current docs search.
    }
  }
  const search = await getSearch(version);
  const response = await search(request);
  response.headers.append('Vary', 'Referer');
  return response;
};
