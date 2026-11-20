import {
  UnsupportedFunctionalityError,
  type Experimental_DecisionModelV4State as DecisionModelV4State,
} from '@ai-sdk/provider';
import {
  convertUint8ArrayToBase64,
  resolveProviderReference,
} from '@ai-sdk/provider-utils';

/** Converts inline file bytes to base64 and rejects file data that cannot be sent. */
export function toGatewayStateParts({
  state,
  modelType,
  allowReferences = false,
  narrowReferences = false,
}: {
  state: DecisionModelV4State;
  modelType: 'decision' | 'extraction';
  allowReferences?: boolean;
  /**
   * Sends only a reference's `gateway` ID, and throws `NoSuchProviderReferenceError`
   * when it has none. Without it, allowed references are sent unchanged.
   */
  narrowReferences?: boolean;
}): DecisionModelV4State {
  return state.map(part => {
    if (part.type !== 'file') return part;
    if (allowReferences && part.data.type === 'reference') {
      if (!narrowReferences) return part;
      return {
        ...part,
        data: {
          type: 'reference',
          reference: {
            gateway: resolveProviderReference({
              reference: part.data.reference,
              provider: 'gateway',
            }),
          },
        },
      };
    }
    if (part.data.type !== 'data') {
      throw new UnsupportedFunctionalityError({
        functionality: `Gateway ${modelType} file input: ${part.data.type} data`,
      });
    }
    const { data } = part.data;
    return {
      ...part,
      data: {
        type: 'data',
        data: typeof data === 'string' ? data : convertUint8ArrayToBase64(data),
      },
    };
  });
}
