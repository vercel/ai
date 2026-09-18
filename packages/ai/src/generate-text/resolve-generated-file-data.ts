import type { LanguageModelV4Content } from '@ai-sdk/provider';
import { download } from '../util/download/download';

// Respect fetch overrides installed after the AI SDK is loaded while retaining
// the DNS-pinned default download path otherwise.
const originalFetch = globalThis.fetch;

type GeneratedFileData = Extract<
  LanguageModelV4Content,
  { type: 'file' | 'reasoning-file' }
>['data'];

export type GeneratedFileDataCache = WeakMap<
  GeneratedFileData,
  string | Uint8Array
>;

export async function resolveGeneratedFileData({
  data,
  abortSignal,
  cache,
}: {
  data: GeneratedFileData;
  abortSignal?: AbortSignal;
  cache?: GeneratedFileDataCache;
}): Promise<string | Uint8Array> {
  if (data.type === 'data') {
    return data.data;
  }

  const cachedData = cache?.get(data);
  if (cachedData != null) {
    return cachedData;
  }

  const downloadedData = (
    await download({
      url: data.url,
      abortSignal,
      fetch: globalThis.fetch === originalFetch ? undefined : globalThis.fetch,
    })
  ).data;

  cache?.set(data, downloadedData);
  return downloadedData;
}
