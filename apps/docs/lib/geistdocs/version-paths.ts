import { collectVersionPaths } from '@vercel/geistdocs/source';
import type { GeistdocsVersionPaths } from '@vercel/geistdocs/versions';
import {
  recipesV5Source,
  recipesV6Source,
  recipesV7Source,
  v5Sources,
  v6Sources,
  v7Sources,
} from './source';

/**
 * Existing prefix-relative paths for version switching. The recipes mirror
 * participates even though sitemap, llms.txt, and search use /cookbook.
 */
export const getVersionPaths = (
  lang: string,
): Record<string, GeistdocsVersionPaths> => ({
  v7: {
    fallbackPath: '/docs/introduction',
    paths: collectVersionPaths({
      lang,
      sources: [...v7Sources, recipesV7Source],
    }),
  },
  v6: {
    fallbackPath: '/docs/introduction',
    paths: collectVersionPaths({
      lang,
      routePrefix: '/v6',
      sources: [...v6Sources, recipesV6Source],
    }),
  },
  v5: {
    fallbackPath: '/docs/introduction',
    paths: collectVersionPaths({
      lang,
      routePrefix: '/v5',
      sources: [...v5Sources, recipesV5Source],
    }),
  },
});
