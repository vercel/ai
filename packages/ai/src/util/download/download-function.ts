import { download } from './download';

/**
 * Experimental. Can change in patch versions without warning.
 *
 * Download function. Called with the URL and media type of the asset.
 *
 * Custom download function can decide:
 * - to return null (which means that the URL should be passed to the model)
 * - to download the asset and return the data (incl. retries, authentication, etc.)
 *
 * Should throw DownloadError if the download fails.
 * Should return null if the URL should be passed through as is.
 * Should return a Uint8Array if the URL was downloaded.
 */
export type DownloadFunction = (options: {
  url: URL;
  isUrlSupportedByModel: boolean;
}) => PromiseLike<{
  data: Uint8Array;
  mediaType: string | undefined;
} | null>;

/**
 * Default download function.
 * Downloads the file if it is not supported by the model.
 */
export const defaultDownloadFunction: DownloadFunction = async ({
  url,
  isUrlSupportedByModel,
}) => {
  return isUrlSupportedByModel ? null : download({ url });
};
