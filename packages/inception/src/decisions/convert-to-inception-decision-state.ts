import {
  UnsupportedFunctionalityError,
  type Experimental_DecisionModelV4State as DecisionModelV4State,
  type JSONValue,
} from '@ai-sdk/provider';
import {
  convertUint8ArrayToBase64,
  detectMediaType,
  isFullMediaType,
} from '@ai-sdk/provider-utils';
import { inceptionDecisionModelLimits } from '../inception-model-catalog';

export function convertToInceptionDecisionState(state: DecisionModelV4State) {
  const parts = state.map((part): JSONValue => {
    switch (part.type) {
      case 'text':
        return part.text;
      case 'json':
        return part.value;
      case 'file': {
        if (part.data.type !== 'data') {
          throw new UnsupportedFunctionalityError({
            functionality: `Inception decision file input: ${part.data.type}`,
          });
        }
        const mediaType = isFullMediaType(part.mediaType)
          ? part.mediaType
          : detectMediaType({ data: part.data.data, topLevelType: 'image' });
        if (
          !inceptionDecisionModelLimits.supportedMediaTypes.some(
            type => type === mediaType,
          )
        ) {
          throw new UnsupportedFunctionalityError({
            functionality: `Inception decision image media type: ${part.mediaType}`,
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

  // Native state accepts strings, objects and arrays, but not bare scalars.
  const single = parts[0];
  return parts.length === 1 &&
    single !== null &&
    (typeof single === 'string' || typeof single === 'object')
    ? single
    : parts;
}
