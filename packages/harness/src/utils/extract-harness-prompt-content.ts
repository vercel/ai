import {
  convertInlineFileDataToUint8Array,
  convertUint8ArrayToBase64,
  detectMediaType,
  getTopLevelMediaType,
  isFullMediaType,
  isProviderReference,
  type FilePart,
  type TextPart,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { HarnessCapabilityUnsupportedError } from '../errors/harness-capability-unsupported-error';
import type { HarnessV1Prompt } from '../v1/harness-v1-prompt';

const harnessPromptContentPartSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({
    type: z.literal('image'),
    data: z.string(),
    mediaType: z.string(),
  }),
]);

export const harnessPromptContentSchema = z.union([
  z.string(),
  z.array(harnessPromptContentPartSchema),
]);

export type HarnessPromptContentPart = z.infer<
  typeof harnessPromptContentPartSchema
>;
export type HarnessPromptContent = z.infer<typeof harnessPromptContentSchema>;

export function extractHarnessPromptContent({
  prompt,
}: {
  prompt: HarnessV1Prompt;
}): HarnessPromptContent {
  if (typeof prompt === 'string') return prompt;
  const { content } = prompt;
  if (typeof content === 'string') return content;
  if (content.every((part): part is TextPart => part.type === 'text')) {
    return content.map(part => part.text).join('\n\n');
  }
  return content.flatMap<HarnessPromptContentPart>(part => {
    switch (part.type) {
      case 'text':
        return [{ type: 'text', text: part.text }];
      case 'image':
        return [
          convertUserImage({
            data: part.image,
            mediaType: part.mediaType ?? 'image',
          }),
        ];
      case 'file':
        if (getTopLevelMediaType(part.mediaType) !== 'image') {
          throw unsupportedUserContent({
            description: `files of media type '${part.mediaType}'`,
          });
        }
        return [convertUserImage(part)];
      default:
        throw unsupportedUserContent({
          description: 'content parts other than text, image, or file parts',
        });
    }
  });
}

function convertUserImage({
  data,
  mediaType,
}: {
  data: FilePart['data'];
  mediaType: string;
}): Extract<HarnessPromptContentPart, { type: 'image' }> {
  const image = getInlineImage({ data });
  const resolvedMediaType = isFullMediaType(mediaType)
    ? mediaType
    : (image.mediaType ??
      detectMediaType({ data: image.data, topLevelType: 'image' }));
  if (resolvedMediaType == null) {
    throw unsupportedUserContent({
      description: 'images whose media type cannot be detected',
    });
  }
  return { type: 'image', data: image.data, mediaType: resolvedMediaType };
}

function getInlineImage({ data }: { data: FilePart['data'] }): {
  data: string;
  mediaType?: string;
} {
  if (data instanceof URL) return getDataUrlImage({ url: data });
  if (typeof data === 'string') {
    let url: URL | undefined;
    try {
      url = new URL(data);
    } catch {
      return { data };
    }
    return getDataUrlImage({ url });
  }
  if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
    return {
      data: convertUint8ArrayToBase64(
        convertInlineFileDataToUint8Array({ type: 'data', data }),
      ),
    };
  }
  if (isProviderReference(data)) {
    throw unsupportedUserContent({
      description: 'provider references',
    });
  }
  switch (data.type) {
    case 'data':
      return typeof data.data === 'string'
        ? { data: data.data }
        : getInlineImage({ data: data.data });
    case 'url':
      return getDataUrlImage({ url: data.url });
    case 'reference':
      throw unsupportedUserContent({
        description: 'provider references',
      });
    case 'text':
      throw unsupportedUserContent({
        description: 'text data for images',
      });
  }
}

function getDataUrlImage({ url }: { url: URL }): {
  data: string;
  mediaType?: string;
} {
  if (url.protocol !== 'data:') {
    throw unsupportedUserContent({
      description: 'remote image URLs',
    });
  }
  const [header, data] = url.href.split(',', 2);
  if (!header?.endsWith(';base64') || data == null) {
    throw unsupportedUserContent({
      description: 'data URLs that are not base64 encoded',
    });
  }
  const mediaType = header.slice('data:'.length).split(';')[0];
  return { data, ...(mediaType ? { mediaType } : {}) };
}

function unsupportedUserContent({
  description,
}: {
  description: string;
}): HarnessCapabilityUnsupportedError {
  return new HarnessCapabilityUnsupportedError({
    message: `The harness layer does not support ${description} in user messages. Pass text parts and inline images as bytes, base64 strings, or data URLs.`,
  });
}
