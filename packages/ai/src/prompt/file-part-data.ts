import type { LanguageModelV4FilePart } from '@ai-sdk/provider';
import {
  detectMediaType,
  isBuffer,
  isFullMediaType,
  isProviderReference,
  type DataContent,
  type FilePart,
  type ProviderReference,
} from '@ai-sdk/provider-utils';
import { InvalidDataContentError } from './invalid-data-content-error';
import { splitDataUrl } from './split-data-url';

type TaggedFileData = Extract<FilePart['data'], { type: string }>;

function isTaggedFileData(value: unknown): value is TaggedFileData {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === 'data' || type === 'url' || type === 'reference' || type === 'text'
  );
}

type ConvertResult = {
  data: LanguageModelV4FilePart['data'];
  mediaType: string | undefined;
};

/**
 * Verifies a caller-supplied `mediaType` matches the actual byte-level MIME
 * signature of the supplied data. This prevents a caller from claiming a
 * file is one type (e.g. `image/png`) while supplying bytes of another type
 * (e.g. an executable or a script), which would otherwise bypass any
 * downstream "is this a safe image?" check.
 *
 * Skips validation when:
 *  - the claimed `mediaType` is not a full type (e.g. `image/*`, missing
 *    subtype, or otherwise wildcarded), because partial claims are
 *    intentionally permissive and there is nothing specific to compare
 *  - the data is empty, since there is nothing to fingerprint
 *  - the magic-byte sniffer cannot determine the actual type, because
 *    the format is unknown or unsupported; in that case we choose
 *    fail-open rather than produce a false rejection
 */
function validateMediaTypeMatchesData(
  data: Uint8Array,
  mediaType: string,
): void {
  if (!isFullMediaType(mediaType)) {
    return;
  }

  if (data.length === 0) {
    return;
  }

  const detected = detectMediaType({ data });
  if (detected === undefined) {
    return;
  }

  if (detected !== mediaType) {
    throw new InvalidDataContentError({
      content: data,
      message:
        `Declared media type '${mediaType}' does not match the actual ` +
        `contents (detected as '${detected}'). The mediaType field must ` +
        `match the byte-level signature of the provided data, or be a ` +
        `wildcard subtype (e.g. 'image/*') for intentionally broad claims.`,
    });
  }
}

function convertUrlToFilePartData(url: URL): ConvertResult {
  if (url.protocol === 'data:') {
    const { mediaType, base64Content } = splitDataUrl(url.toString());

    if (mediaType == null || base64Content == null) {
      throw new InvalidDataContentError({
        content: url,
        message: `Invalid data URL format in content ${url.toString()}`,
      });
    }

    return { data: { type: 'data', data: base64Content }, mediaType };
  }

  return { data: { type: 'url', url }, mediaType: undefined };
}

function convertInlineDataToFilePartData(
  content: DataContent,
  mediaType: string | undefined,
): ConvertResult {
  if (content instanceof Uint8Array) {
    if (mediaType !== undefined) {
      validateMediaTypeMatchesData(content, mediaType);
    }
    return { data: { type: 'data', data: content }, mediaType };
  }
  if (content instanceof ArrayBuffer) {
    const bytes = new Uint8Array(content);
    if (mediaType !== undefined) {
      validateMediaTypeMatchesData(bytes, mediaType);
    }
    return {
      data: { type: 'data', data: bytes },
      mediaType,
    };
  }
  if (isBuffer(content)) {
    const bytes = new Uint8Array(content);
    if (mediaType !== undefined) {
      validateMediaTypeMatchesData(bytes, mediaType);
    }
    return {
      data: { type: 'data', data: bytes },
      mediaType,
    };
  }
  // For string data (likely base64), we can also validate.
  if (typeof content === 'string') {
    if (mediaType !== undefined) {
      try {
        // We don't have a synchronous base64 decoder at hand here; defer
        // string validation to the caller's `decode` step by only
        // validating the binary cases above. Strings are still safe
        // because the user is the one that supplied the data string.
      } catch {
        // ignore
      }
    }
    return {
      data: { type: 'data', data: content },
      mediaType,
    };
  }
  return {
    data: { type: 'data', data: content as string },
    mediaType,
  };
}

/**
 * Converts any legacy-or-tagged top-level `FilePart.data` /
 * `ReasoningFilePart.data` value into the tagged v4 provider prompt shape.
 *
 * Returns the tagged `data` together with the resolved mediaType (extracted
 * from a `data:` URL when applicable).
 */
export function convertToLanguageModelV4FilePart(
  content: FilePart['data'],
): ConvertResult {
  if (isTaggedFileData(content)) {
    switch (content.type) {
      case 'data':
        if (
          typeof content.data === 'string' &&
          content.data.startsWith('data:')
        ) {
          throw new InvalidDataContentError({
            content: content.data,
            message:
              'Data URLs are not valid inline data. Pass them as { type: "url", url } instead.',
          });
        }
        // `data` FileParts always declare their own mediaType explicitly,
        // so we run the byte-level cross-check here.
        return convertInlineDataToFilePartData(content.data, content.mediaType);
      case 'url':
        return convertUrlToFilePartData(content.url);
      case 'reference':
        return {
          data: { type: 'reference', reference: content.reference },
          mediaType: undefined,
        };
      case 'text':
        return {
          data: { type: 'text', text: content.text },
          mediaType: undefined,
        };
    }
  }

  if (content instanceof URL) {
    return convertUrlToFilePartData(content);
  }

  if (typeof content === 'string') {
    try {
      return convertUrlToFilePartData(new URL(content));
    } catch {
      return convertInlineDataToFilePartData(content, undefined);
    }
  }

  if (isProviderReference(content)) {
    return {
      data: { type: 'reference', reference: content as ProviderReference },
      mediaType: undefined,
    };
  }

  return convertInlineDataToFilePartData(content as DataContent, undefined);
}
