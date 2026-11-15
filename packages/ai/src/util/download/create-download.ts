import type { FetchFunction } from '@ai-sdk/provider-utils';
import { download as internalDownload } from './download';
import type { DownloadFunction } from './download-function';

type DownloadRequest = { url: URL; abortSignal?: AbortSignal };
type DownloadResult = { data: Uint8Array; mediaType: string | undefined };

/**
 * Download function created by `createDownload()`.
 *
 * Called with a single request, it downloads that URL. This is the shape
 * expected by the `download` option of `transcribe()` and
 * `experimental_generateVideo()`.
 *
 * Called with an array of requests, it behaves like the default
 * `experimental_download` function of `generateText()` and `streamText()`:
 * URLs the model supports are passed through (`null`), all others are
 * downloaded.
 */
export type Download = {
  (request: DownloadRequest): Promise<DownloadResult>;
  (
    requests: Parameters<DownloadFunction>[0],
  ): Promise<Awaited<ReturnType<DownloadFunction>>>;
};

/**
 * Creates a download function with configurable options.
 *
 * @param options - Configuration options for the download function.
 * @param options.maxBytes - Maximum allowed download size in bytes. Default: 2 GiB.
 * @param options.fetch - Fetch transport, e.g. guarded-fetch for DNS validation on Node.js.
 * @returns A download function that can be passed to `transcribe()`,
 * `experimental_generateVideo()`, or as `experimental_download` to
 * `generateText()` and `streamText()`.
 */
export function createDownload(options?: {
  maxBytes?: number;
  fetch?: FetchFunction;
}): Download {
  const download = ({ url, abortSignal }: DownloadRequest) =>
    internalDownload({
      url,
      maxBytes: options?.maxBytes,
      abortSignal,
      fetch: options?.fetch,
    });

  return ((
    requests: DownloadRequest | Parameters<DownloadFunction>[0],
  ): Promise<DownloadResult | Awaited<ReturnType<DownloadFunction>>> =>
    Array.isArray(requests)
      ? Promise.all(
          requests.map(request =>
            request.isUrlSupportedByModel ? null : download(request),
          ),
        )
      : download(requests)) as Download;
}
