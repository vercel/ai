import { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { ProviderMetadata } from '../types/provider-metadata';

export type UglyTransformedStreamTextPart =
  | Exclude<
      LanguageModelV4StreamPart,
      | {
          type: 'text-delta';
        }
      | {
          type: 'reasoning-delta';
        }
    >
  | {
      type: 'text-delta';
      id: string;
      providerMetadata?: ProviderMetadata;
      text: string;
    }
  | {
      type: 'reasoning-delta';
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
      switch (chunk.type) {
        case 'text-delta':
          controller.enqueue({
            type: 'text-delta',
            id: chunk.id,
            text: chunk.delta,
            providerMetadata: chunk.providerMetadata,
          });
          break;

        case 'reasoning-delta':
          controller.enqueue({
            type: 'reasoning-delta',
            id: chunk.id,
            text: chunk.delta,
            providerMetadata: chunk.providerMetadata,
          });
          break;

        default:
          controller.enqueue(chunk);
          break;
      }
    },
  });
}
