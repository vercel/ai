import {
  InvalidArgumentError,
  UnsupportedFunctionalityError,
  type Experimental_DecisionModelV4State as DecisionModelV4State,
  type JSONValue,
} from '@ai-sdk/provider';
import {
  convertUint8ArrayToBase64,
  detectMediaType,
  isFullMediaType,
} from '@ai-sdk/provider-utils';

export function convertToPerplexityDecisionState(state: DecisionModelV4State) {
  const parts = state.map((part): JSONValue => {
    switch (part.type) {
      case 'text':
        return part.text;
      case 'json':
        return part.value;
      case 'file': {
        if (part.data.type !== 'data') {
          throw new UnsupportedFunctionalityError({
            functionality: `Perplexity decision file input: ${part.data.type}`,
          });
        }
        const mediaType = isFullMediaType(part.mediaType)
          ? part.mediaType
          : detectMediaType({ data: part.data.data, topLevelType: 'image' });
        if (
          !['image/png', 'image/jpeg', 'image/webp'].includes(mediaType ?? '')
        ) {
          throw new UnsupportedFunctionalityError({
            functionality: `Perplexity decision image media type: ${part.mediaType}`,
          });
        }
        const data =
          typeof part.data.data === 'string'
            ? part.data.data
            : convertUint8ArrayToBase64(part.data.data);
        return {
          type: 'image_url',
          image_url: { url: `data:${mediaType};base64,${data}` },
        };
      }
    }
  });

  if (countImages(parts) > 8) {
    throw new InvalidArgumentError({
      argument: 'state',
      message:
        'Perplexity Decisions supports at most 8 images in the shared state.',
    });
  }

  // Preserve a single string/object/array as native state. Other JSON values
  // must remain inside an array because the API rejects them at the top level.
  const single = parts[0];
  return parts.length === 1 &&
    single !== null &&
    (typeof single === 'string' || typeof single === 'object')
    ? single
    : parts;
}

function countImages(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce<number>((count, item) => count + countImages(item), 0);
  }
  if (value === null || typeof value !== 'object') return 0;

  const object = value as Record<string, unknown>;
  if (object.type === 'image_url') {
    const image = object.image_url as { url?: unknown } | null | undefined;
    if (
      image == null ||
      typeof image !== 'object' ||
      Array.isArray(image) ||
      typeof image.url !== 'string' ||
      !/^data:image\/(png|jpeg|webp);base64,/i.test(image.url)
    ) {
      throw new UnsupportedFunctionalityError({
        functionality:
          'Perplexity decision images require PNG, JPEG, or WebP base64 data URLs',
      });
    }
    return 1;
  }

  return Object.values(value).reduce<number>(
    (count, item) => count + (item === undefined ? 0 : countImages(item)),
    0,
  );
}
