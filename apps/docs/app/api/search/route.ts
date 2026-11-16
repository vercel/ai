import { createSearchRoute } from '@vercel/geistdocs/routes/search';
import { config } from '@/lib/geistdocs/config';

// TEMPORARY DIAGNOSTICS: this revision defers the source import and the
// per-version index creation so their cost can be reported per phase in a
// Server-Timing header. It is not the final shape of this route.

type Version = 'v5' | 'v6' | 'v7';
type Search = ReturnType<typeof createSearchRoute>;

const phases: string[] = [];
const measure = async <T>(name: string, run: () => T | Promise<T>) => {
  const start = performance.now();
  try {
    return await run();
  } finally {
    phases.push(`${name};dur=${(performance.now() - start).toFixed(1)}`);
  }
};

const importSources = () => import('@/lib/geistdocs/source');
let sources: ReturnType<typeof importSources> | undefined;
const loadSources = () =>
  (sources ??= measure('import-sources', importSources));

const searches = new Map<Version, Promise<Search>>();
const getSearch = (version: Version) => {
  let search = searches.get(version);
  if (!search) {
    search = loadSources().then(source =>
      measure(`create-${version}`, () =>
        createSearchRoute({
          config,
          sources: {
            v5: source.v5Sources,
            v6: source.v6Sources,
            v7: source.v7Sources,
          }[version],
        }),
      ),
    );
    searches.set(version, search);
  }
  return search;
};

const withTimings = async (
  version: Version,
  run: (search: Search) => Promise<Response>,
) => {
  const start = performance.now();
  const search = await getSearch(version);
  const ready = performance.now();
  const response = await run(search);
  const done = performance.now();
  const memory = process.memoryUsage();
  response.headers.set(
    'Server-Timing',
    [
      // Phases recorded so far in this instance (only on its first requests).
      ...phases.splice(0),
      `ready-${version};dur=${(ready - start).toFixed(1)}`,
      `search-${version};dur=${(done - ready).toFixed(1)}`,
      `uptime;dur=${(process.uptime() * 1000).toFixed(0)}`,
      `rss;desc="${Math.round(memory.rss / 1e6)}MB"`,
      `heap;desc="${Math.round(memory.heapUsed / 1e6)}MB"`,
    ].join(', '),
  );
  return response;
};

export const GET = async (request: Request) => {
  const url = new URL(request.url);
  const tag = url.searchParams.get('tag');

  if (tag === 'v5' || tag === 'v6' || tag === 'v7') {
    // The version scopes the client cache and selects an index. It is not a
    // content tag: passing it to Geistdocs would filter out every result.
    url.searchParams.delete('tag');
    return withTimings(tag, search => search(new Request(url, request)));
  }

  // Keep unscoped clients (including WebMCP) compatible with versioned pages.
  const referer = request.headers.get('referer');
  let version: Version = 'v7';
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
  const response = await withTimings(version, search => search(request));
  response.headers.append('Vary', 'Referer');
  return response;
};
