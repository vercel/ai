import type { FetchFunction } from '@ai-sdk/provider-utils';
import { download as internalDownload } from './download';

/**
 * Creates a download function with configurable options.
 *
 * @param options - Configuration options for the download function.
 * @param options.maxBytes - Maximum allowed download size in bytes. Default: 2 GiB.
 * @param options.fetch - Fetch transport, e.g. guarded-fetch for DNS validation on Node.js.
 * @returns A download function that can be passed to `transcribe()` or `experimental_generateVideo()`.
 */
export function createDownload(options?: {
  maxBytes?: number;
  fetch?: FetchFunction;
}) {
  return ({ url, abortSignal }: { url: URL; abortSignal?: AbortSignal }) =>
    internalDownload({
      url,
      maxBytes: options?.maxBytes,
      abortSignal,
      fetch: options?.fetch,
    });
}
