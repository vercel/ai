import { DownloadError } from './download-error';

export async function download({
  url,
  fetchImplementation = fetch,
}: {
  url: URL;
  fetchImplementation?: typeof fetch;
}): Promise<{
  data: Uint8Array;
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
      data: new Uint8Array(await response.arrayBuffer()),
      mimeType: response.headers.get('content-type') ?? undefined,
    };
  } catch (error) {
    if (DownloadError.isInstance(error)) {
      throw error;
    }

    throw new DownloadError({ url: urlText, cause: error });
  }
}
