import { download as originalDownload } from './download';

/**
 * Experimental. Can change in patch versions without warning.
 *
 * Result type for each URL processed by the download function.
 *
 * - `{ data, mediaType }`: Downloaded content to replace the URL
 * - `string`: Replace the image/file part with a text part
 * - `URL`: Keep the URL as-is (passthrough to model)
 * - `null`: Remove the part entirely (e.g., for 404/invalid URLs)
 */
export type DownloadFunctionResult =
  | { data: Uint8Array; mediaType: string | undefined }
  | URL
  | string
  | null;

/**
 * Experimental. Can change in patch versions without warning.
 *
 * Download function. Called with the array of URLs and a boolean indicating
 * whether the URL is supported by the model.
 *
 * The download function can decide for each URL:
 * - return `{ data, mediaType }` to use downloaded content
 * - return the `URL` to pass it through to the model as-is
 * - return a `string` to replace the image/file part with text
 * - return `null` to remove the part entirely
 *
 * Should throw DownloadError if the download fails unexpectedly.
 *
 * Should return an array of results sorted by the order of the requested downloads.
 */
export type DownloadFunction = (
  options: Array<{
    url: URL;
    isUrlSupportedByModel: boolean;
  }>,
) => PromiseLike<Array<DownloadFunctionResult>>;

/**
 * Default download function.
 * Downloads the file if it is not supported by the model.
 * Returns the URL as-is if the model supports it.
 */
export const createDefaultDownloadFunction =
  (download: typeof originalDownload = originalDownload): DownloadFunction =>
  requestedDownloads =>
    Promise.all(
      requestedDownloads.map(async requestedDownload =>
        requestedDownload.isUrlSupportedByModel
          ? requestedDownload.url
          : download(requestedDownload),
      ),
    );
