import type { EmbeddingModelV2 } from '@ai-sdk/provider';
import { EXPERIMENTAL_EMBEDDING_MODEL_MAX_INPUT_BYTES_PER_CALL } from '@ai-sdk/provider-utils';

export type EmbeddingModelWithMaxInputBytesPerCall<VALUE> =
  EmbeddingModelV2<VALUE> & {
    readonly [EXPERIMENTAL_EMBEDDING_MODEL_MAX_INPUT_BYTES_PER_CALL]?:
      | PromiseLike<number | undefined>
      | number
      | undefined;
  };

export function getEmbeddingModelMaxInputBytesPerCall<VALUE>(
  model: EmbeddingModelV2<VALUE>,
) {
  return (model as EmbeddingModelWithMaxInputBytesPerCall<VALUE>)[
    EXPERIMENTAL_EMBEDDING_MODEL_MAX_INPUT_BYTES_PER_CALL
  ];
}
