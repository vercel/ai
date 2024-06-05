import { DownloadError } from '@ai-sdk/provider';

export async function download({
  url,
  fetchImplementation = fetch,
}: {
  url: URL;
  fetchImplementation?: typeof fetch;
}): Promise<{
  data: ArrayBuffer;
  mimeType: string | undefined;
}> {
  const urlText = url.toString();
  try {
    const response = await fetchImplementation(urlText);

    if (!response.ok) {
      throw new DownloadError({
        url: urlText,
        statusCode: response.status,
        statusText: response.statusText,
      });
    }

    return {
      data: await response.arrayBuffer(),
      mimeType: response.headers.get('content-type') ?? undefined,
    };
  } catch (error) {
    if (DownloadError.isDownloadError(error)) {
      throw error;
    }

    throw new DownloadError({ url: urlText, cause: error });
  }
}
