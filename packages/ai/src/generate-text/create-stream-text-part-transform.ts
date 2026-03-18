import { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { ProviderMetadata } from '../types/provider-metadata';
import { DefaultGeneratedFileWithType, GeneratedFile } from './generated-file';

export type UglyTransformedStreamTextPart =
  | Exclude<
      LanguageModelV4StreamPart,
      | {
          type: 'text-delta';
        }
      | {
          type: 'reasoning-delta';
        }
      | {
          type: 'file';
        }
      | {
          type: 'reasoning-file';
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
    }
  | {
      type: 'file';
      file: GeneratedFile;
      providerMetadata?: ProviderMetadata;
    }
  | {
      type: 'reasoning-file';
      file: GeneratedFile;
      providerMetadata?: ProviderMetadata;
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

        case 'file':
        case 'reasoning-file': {
          controller.enqueue({
            type: chunk.type,
            file: new DefaultGeneratedFileWithType({
              data: chunk.data,
              mediaType: chunk.mediaType,
            }),
            providerMetadata: chunk.providerMetadata,
          });
          break;
        }

        default:
          controller.enqueue(chunk);
          break;
      }
    },
  });
}
