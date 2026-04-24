import { AISDKError, LanguageModelV4FilePart } from '@ai-sdk/provider';
import {
  DataContent,
  FilePart,
  ProviderReference,
} from '@ai-sdk/provider-utils';
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

function urlToV4(url: URL): ConvertResult {
  if (url.protocol === 'data:') {
    const { mediaType, base64Content } = splitDataUrl(url.toString());

    if (mediaType == null || base64Content == null) {
      throw new AISDKError({
        name: 'InvalidDataContentError',
        message: `Invalid data URL format in content ${url.toString()}`,
      });
    }

    return { data: { type: 'data', data: base64Content }, mediaType };
  }

  return { data: { type: 'url', url }, mediaType: undefined };
}

function inlineDataToV4(content: DataContent): ConvertResult {
  if (content instanceof Uint8Array) {
    return { data: { type: 'data', data: content }, mediaType: undefined };
  }
  if (content instanceof ArrayBuffer) {
    return {
      data: { type: 'data', data: new Uint8Array(content) },
      mediaType: undefined,
    };
  }
  if (globalThis.Buffer?.isBuffer(content) ?? false) {
    return {
      data: {
        type: 'data',
        data: new Uint8Array(content as unknown as Buffer),
      },
      mediaType: undefined,
    };
  }
  return {
    data: { type: 'data', data: content as string },
    mediaType: undefined,
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
          throw new AISDKError({
            name: 'InvalidDataContentError',
            message:
              'Data URLs are not valid inline data. Pass them as { type: "url", url } instead.',
          });
        }
        return inlineDataToV4(content.data);
      case 'url':
        return urlToV4(content.url);
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
    return urlToV4(content);
  }

  if (typeof content === 'string') {
    try {
      return urlToV4(new URL(content));
    } catch {
      return inlineDataToV4(content);
    }
  }

  if (
    content instanceof Uint8Array ||
    content instanceof ArrayBuffer ||
    (globalThis.Buffer?.isBuffer(content) ?? false)
  ) {
    return inlineDataToV4(content as DataContent);
  }

  return {
    data: { type: 'reference', reference: content as ProviderReference },
    mediaType: undefined,
  };
}
