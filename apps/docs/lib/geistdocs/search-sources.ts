export type SearchVersion = 'v5' | 'v6' | 'v7';

/**
 * The sources `/api/search` indexes for a version.
 *
 * Production deployments read them from the prebuilt search index. Other
 * builds have no index and read them from the compiled pages, which loads the
 * MDX of every version and makes an instance's first search several seconds
 * slower.
 */
export const loadSearchSources = async (version: SearchVersion) => {
  // `next.config.ts` inlines this flag, so a build bundles only the branch it
  // takes: production must not ship the compiled pages with the search route,
  // and the index modules do not exist anywhere else.
  if (process.env.DOCS_PREBUILT_SEARCH_INDEX === 'true') {
    const { loadSearchIndexSources } = await import('./search-index-sources');
    return loadSearchIndexSources(version);
  }

  const source = await import('./source');
  return { v5: source.v5Sources, v6: source.v6Sources, v7: source.v7Sources }[
    version
  ];
};
