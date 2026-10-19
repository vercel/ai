import type { LanguageModelV3FilePart } from '@ai-sdk/provider';
import { convertToBase64, parseProviderOptions } from '@ai-sdk/provider-utils';
import {
  minimaxImagePartOptions,
  minimaxVideoPartOptions,
} from './minimax-media-options';

export async function convertToMiniMaxMediaPart(part: LanguageModelV3FilePart) {
  const type = part.mediaType.startsWith('image/')
    ? 'image'
    : part.mediaType.startsWith('video/')
      ? 'video'
      : undefined;
  if (type == null) {
    return undefined;
  }
  const mediaOptions =
    type === 'image'
      ? await parseProviderOptions({
          provider: 'minimax',
          providerOptions: part.providerOptions,
          schema: minimaxImagePartOptions,
        })
      : await parseProviderOptions({
          provider: 'minimax',
          providerOptions: part.providerOptions,
          schema: minimaxVideoPartOptions,
        });

  const source =
    part.data instanceof URL ||
    (typeof part.data === 'string' && /^https?:\/\//i.test(part.data))
      ? { type: 'url' as const, url: part.data.toString() }
      : {
          type: 'base64' as const,
          media_type:
            part.mediaType === 'image/*' ? 'image/jpeg' : part.mediaType,
          data: convertToBase64(part.data),
        };

  return { type, source: { ...source, ...mediaOptions } } as const;
}
