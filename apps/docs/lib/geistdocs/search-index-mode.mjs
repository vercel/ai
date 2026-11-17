/**
 * Whether this build searches the prebuilt search index instead of the
 * compiled pages. Only production deployments do: building the index adds
 * about ten seconds to a build, and previews do not need a fast first search.
 *
 * `scripts/build-search-index.mjs` builds the index when this is true, and
 * `next.config.ts` inlines the value for `lib/geistdocs/search-sources.ts`.
 * Both must agree, which is why they share this definition.
 */
export const hasPrebuiltSearchIndex = process.env.VERCEL_ENV === 'production';
