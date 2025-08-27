import { download as originalDownload } from './download';

/**
 * Experimental. Can change in patch versions without warning.
 *
 * Download function. Called with the array of URLs and media types of the assets.
 *
 * Custom download function can decide for each URL:
 * - to return null (which means that the URL should be passed to the model)
 * - to download the asset and return the data (incl. retries, authentication, etc.)
 *
 * Should throw DownloadError if the download fails.
 * Should return null if the URL should be passed through as is.
 * Should return a Uint8Array if the URL was downloaded.
 */
export type DownloadFunction = (
  options: Array<{
    url: URL;
    isUrlSupportedByModel: boolean;
  }>,
) => PromiseLike<
  Array<{
    data: Uint8Array;
    mediaType: string | undefined;
  } | null>
>;

/**
 * Default download function.
 * Downloads the file if it is not supported by the model.
 */
export const createDefaultDownloadFunction =
  (download: typeof originalDownload = originalDownload): DownloadFunction =>
  async requestedDownloads => {
    return await Promise.all(
      requestedDownloads.map(async requestedDownload => {
        if (requestedDownload.isUrlSupportedByModel) {
          return null;
        }

        const downloadedResult = await download(requestedDownload);

        return {
          url: requestedDownload.url.toString(),
          data: downloadedResult.data,
          mediaType: downloadedResult.mediaType,
        };
      }),
    );
  };
