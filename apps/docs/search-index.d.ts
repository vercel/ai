// scripts/build-search-index.mjs generates these modules for production
// deployments only. Every other build type-checks without them.
declare module '@/.search-index/*' {
  import type { SearchIndex } from '@/lib/geistdocs/search-index-sources';

  const index: SearchIndex;
  export default index;
}
