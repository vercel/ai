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

export function convertToBasetenDecisionState(state: DecisionModelV4State) {
  const files = state.filter(part => part.type === 'file');
  if (files.length > 4) {
    throw new InvalidArgumentError({
      argument: 'state',
      message: 'Baseten decision models support at most 4 images per request.',
    });
  }

  if (files.length === 0) {
    const values = state.map(part => {
      switch (part.type) {
        case 'text':
          return part.text;
        case 'json':
          return part.value;
        default:
          throw new UnsupportedFunctionalityError({
            functionality: 'Baseten decision file input',
          });
      }
    });
    const single = values[0];
    // The API accepts strings, objects and arrays as top-level state.
    return values.length === 1 &&
      single !== null &&
      (typeof single === 'string' || typeof single === 'object')
      ? single
      : values;
  }

  // Images must be content parts of a user message, not top-level state parts.
  return {
    messages: [
      {
        role: 'user',
        content: state.map((part): JSONValue => {
          if (part.type !== 'file') {
            return {
              type: 'text',
              text:
                part.type === 'text' ? part.text : JSON.stringify(part.value),
            };
          }
          if (part.data.type !== 'data') {
            throw new UnsupportedFunctionalityError({
              functionality: `Baseten decision file input: ${part.data.type}`,
            });
          }
          const mediaType = isFullMediaType(part.mediaType)
            ? part.mediaType
            : detectMediaType({ data: part.data.data, topLevelType: 'image' });
          if (
            !['image/png', 'image/jpeg', 'image/webp'].includes(mediaType ?? '')
          ) {
            throw new UnsupportedFunctionalityError({
              functionality: `Baseten decision image media type: ${part.mediaType}`,
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
        }),
      },
    ],
  };
}
