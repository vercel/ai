import type { LanguageModelV4Content } from '@ai-sdk/provider';
import { DownloadError } from '@ai-sdk/provider-utils';
import { download as defaultDownload } from '../util/download/download';
import type { DownloadFunction } from '../util/download/download-function';

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
  download,
  abortSignal,
  cache,
}: {
  data: GeneratedFileData;
  download?: DownloadFunction;
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

  const downloadedData =
    download == null
      ? (await defaultDownload({ url: data.url, abortSignal })).data
      : await downloadGeneratedFile({ url: data.url, download });

  cache?.set(data, downloadedData);
  return downloadedData;
}

// Generated files have no model to pass the URL through to, so a null result
// from the download function cannot be honored.
async function downloadGeneratedFile({
  url,
  download,
}: {
  url: URL;
  download: DownloadFunction;
}): Promise<Uint8Array> {
  const [result] = await download([{ url, isUrlSupportedByModel: false }]);

  if (result == null) {
    throw new DownloadError({
      url: url.toString(),
      message: `Generated file URL ${url} must be downloaded, but the download function returned null`,
    });
  }

  return result.data;
}
