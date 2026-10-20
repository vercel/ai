import {
  UnsupportedFunctionalityError,
  type LanguageModelV4FilePart,
} from '@ai-sdk/provider';
import {
  convertToBase64,
  getTopLevelMediaType,
  parseProviderOptions,
  resolveFullMediaType,
  resolveProviderReference,
} from '@ai-sdk/provider-utils';
import {
  minimaxImagePartOptions,
  minimaxVideoPartOptions,
} from './minimax-media-options';

export async function convertToMiniMaxMediaPart(part: LanguageModelV4FilePart) {
  const type = getTopLevelMediaType(part.mediaType);
  if (type !== 'image' && type !== 'video') {
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

  let source:
    | { type: 'base64'; media_type: string; data: string }
    | { type: 'url'; url: string };
  switch (part.data.type) {
    case 'data':
      source = {
        type: 'base64',
        media_type: resolveFullMediaType({ part }),
        data: convertToBase64(part.data.data),
      };
      break;
    case 'url':
      source = { type: 'url', url: part.data.url.toString() };
      break;
    case 'reference': {
      if (type !== 'video') {
        throw new UnsupportedFunctionalityError({
          functionality: 'MiniMax image file references',
        });
      }
      const fileId = resolveProviderReference({
        reference: part.data.reference,
        provider: 'minimax',
      });
      source = {
        type: 'url',
        url: fileId.startsWith('mm_file://') ? fileId : `mm_file://${fileId}`,
      };
      break;
    }
    default:
      throw new UnsupportedFunctionalityError({
        functionality: `MiniMax ${type} input with ${part.data.type} data`,
      });
  }

  return { type, source: { ...source, ...mediaOptions } } as const;
}
