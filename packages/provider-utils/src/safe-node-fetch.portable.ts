import type { FetchFunction } from './fetch-function';

// Selected at build time so portable bundles never resolve Node dependencies.
export async function getDefaultDownloadFetch(): Promise<FetchFunction> {
  return globalThis.fetch;
}
