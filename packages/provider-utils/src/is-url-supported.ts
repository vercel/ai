/**
 * Checks if the given URL is supported natively by the model.
 *
 * @param mediaType - The media type of the URL. Case-sensitive. May be a full
 *                    `type/subtype`, a wildcard `type/*`, or just the
 *                    top-level segment (e.g. `image`).
 * @param url - The URL to check.
 * @param supportedUrls - A record where keys are case-sensitive media types (or '*')
 *                        and values are arrays of RegExp patterns for URLs.
 *
 * @returns `true` if the URL matches a pattern under the specific media type
 *          or the wildcard '*', `false` otherwise.
 */
export function isUrlSupported({
  mediaType,
  url,
  supportedUrls,
}: {
  mediaType: string;
  url: string;
  supportedUrls: Record<string, RegExp[]>;
}): boolean {
  // standardize media type and url to lower case
  url = url.toLowerCase();
  mediaType = mediaType.toLowerCase();

  const isTopLevelOnly = !mediaType.includes('/');

  return (
    Object.entries(supportedUrls)
      // standardize supported url map into lowercase prefixes:
      .map(([key, value]) => {
        const mediaType = key.toLowerCase();
        return mediaType === '*' || mediaType === '*/*'
          ? { mediaTypePrefix: '', regexes: value }
          : { mediaTypePrefix: mediaType.replace(/\*/, ''), regexes: value };
      })
      // gather all regexp pattern from matched media type prefixes:
      .filter(({ mediaTypePrefix }) => {
        if (mediaTypePrefix === '') {
          return true;
        }
        // For a top-level-only media type (e.g. `image`), we cannot determine
        // whether a specific subtype (e.g. `image/png`) would apply, so we
        // only match the corresponding `type/*` prefix exactly.
        if (isTopLevelOnly) {
          return `${mediaType}/` === mediaTypePrefix;
        }
        return mediaType.startsWith(mediaTypePrefix);
      })
      .flatMap(({ regexes }) => regexes)
      // check if any pattern matches the url:
      .some(pattern => testRegExpFromStart(pattern, url))
  );
}

function testRegExpFromStart(pattern: RegExp, value: string): boolean {
  if (!pattern.global && !pattern.sticky) {
    return pattern.test(value);
  }

  // Global and sticky regexes retain match state in lastIndex.
  // Evaluate from the start without changing caller-owned state.
  const lastIndex = pattern.lastIndex;
  pattern.lastIndex = 0;

  try {
    return pattern.test(value);
  } finally {
    pattern.lastIndex = lastIndex;
  }
}
