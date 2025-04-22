/**
 * Checks if the given URL is supported natively by the model.
 *
 * @param mediaType - The media type of the URL.
 * @param url - The URL to check.
 * @param supportedUrls - The supported URLs of the model.
 *
 * @returns `true` if the URL is supported by the model, `false` otherwise.
 */
export async function isUrlSupported({
  mediaType,
  url,
  supportedUrls,
}: {
  mediaType: string;
  url: string;
  supportedUrls: Record<string, RegExp[]>;
}) {
  return false;
}
