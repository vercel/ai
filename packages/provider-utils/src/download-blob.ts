import { DownloadError } from './download-error';

/**
 * Download a file from a URL and return it as a Blob.
 *
 * @param url - The URL to download from.
 * @returns A Promise that resolves to the downloaded Blob.
 *
 * @throws DownloadError if the download fails.
 */
export async function downloadBlob(url: string): Promise<Blob> {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new DownloadError({
        url,
        statusCode: response.status,
        statusText: response.statusText,
      });
    }

    return await response.blob();
  } catch (error) {
    if (DownloadError.isInstance(error)) {
      throw error;
    }

    throw new DownloadError({ url, cause: error });
  }
}
