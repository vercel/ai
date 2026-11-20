export type ContentKind = 'html' | 'text' | 'unsupported';

const TEXT_MEDIA_TYPES = new Set([
  'application/ecmascript',
  'application/javascript',
  'application/json',
  'application/ld+json',
  'application/toml',
  'application/x-javascript',
  'application/x-ndjson',
  'application/x-yaml',
  'application/xml',
  'application/yaml',
]);

export function getMediaType(contentType: string | undefined) {
  const mediaType = contentType?.split(';')[0]?.trim().toLowerCase();
  return mediaType === '' ? undefined : mediaType;
}

function startsWithBytes(body: Uint8Array, prefix: number[]) {
  return prefix.every((byte, index) => body[index] === byte);
}

function looksLikeHtml(body: Uint8Array) {
  const start = new TextDecoder()
    .decode(body.subarray(0, 512))
    .trimStart()
    .toLowerCase();
  return start.startsWith('<!doctype html') || start.startsWith('<html');
}

/**
 * Decides how to handle a response body. Uses the Content-Type header and
 * falls back to sniffing when the server omits it or sends a generic type.
 */
export function classifyContent({
  mediaType,
  body,
}: {
  mediaType: string | undefined;
  body: Uint8Array;
}): ContentKind {
  // Without a specific type, sniff the content.
  if (mediaType === undefined || mediaType === 'application/octet-stream') {
    return looksLikeHtml(body) ? 'html' : 'unsupported';
  }

  if (mediaType === 'text/html' || mediaType === 'application/xhtml+xml') {
    return 'html';
  }

  if (
    mediaType.startsWith('text/') ||
    TEXT_MEDIA_TYPES.has(mediaType) ||
    mediaType.endsWith('+json') ||
    mediaType.endsWith('+xml')
  ) {
    return 'text';
  }

  return 'unsupported';
}

function getCharsetFromContentType(contentType: string | undefined) {
  return contentType
    ?.match(/;\s*charset\s*=\s*"?([^";\s]+)"?/i)?.[1]
    ?.toLowerCase();
}

function getCharsetFromBom(body: Uint8Array) {
  if (startsWithBytes(body, [0xef, 0xbb, 0xbf])) return 'utf-8';
  if (startsWithBytes(body, [0xfe, 0xff])) return 'utf-16be';
  if (startsWithBytes(body, [0xff, 0xfe])) return 'utf-16le';
  return undefined;
}

// Simplified version of the WHATWG encoding prescan of the first 1024 bytes.
function getCharsetFromMetaTag(body: Uint8Array) {
  const head = new TextDecoder('windows-1252').decode(body.subarray(0, 1024));
  return head
    .match(/<meta[^>]+charset\s*=\s*["']?\s*([\w.:-]+)/i)?.[1]
    ?.toLowerCase();
}

/**
 * Decodes a text response. The byte order mark takes precedence, then the
 * Content-Type charset, then (for HTML) a `<meta charset>` declaration.
 * Unknown or missing encodings fall back to UTF-8.
 */
export function decodeText({
  body,
  contentType,
  isHtml,
}: {
  body: Uint8Array;
  contentType: string | undefined;
  isHtml: boolean;
}): string {
  const charset =
    getCharsetFromBom(body) ??
    getCharsetFromContentType(contentType) ??
    (isHtml ? getCharsetFromMetaTag(body) : undefined) ??
    'utf-8';

  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return new TextDecoder().decode(body);
  }
}
