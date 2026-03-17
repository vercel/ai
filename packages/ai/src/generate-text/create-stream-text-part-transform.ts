import { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { ProviderMetadata } from '../types/provider-metadata';

export type UglyTransformedStreamTextPart =
  | Exclude<
      LanguageModelV4StreamPart,
      {
        type: 'text-delta';
      }
    >
  | {
      type: 'text-delta';
      id: string;
      providerMetadata?: ProviderMetadata;
      text: string;
    };

export function createStreamTextPartTransform() {
  return new TransformStream<
    LanguageModelV4StreamPart,
    UglyTransformedStreamTextPart
  >({
    async transform(chunk, controller) {
      if (chunk.type === 'text-delta') {
        controller.enqueue({
          type: 'text-delta',
          id: chunk.id,
          text: chunk.delta,
          providerMetadata: chunk.providerMetadata,
        });
      } else {
        controller.enqueue(chunk);
      }
    },
  });
}
