import type { EmbeddingModelV3 } from '@ai-sdk/provider';
import { EXPERIMENTAL_EMBEDDING_MODEL_MAX_INPUT_BYTES_PER_CALL } from '@ai-sdk/provider-utils';

export type EmbeddingModelWithMaxInputBytesPerCall = EmbeddingModelV3 & {
  readonly [EXPERIMENTAL_EMBEDDING_MODEL_MAX_INPUT_BYTES_PER_CALL]?:
    | PromiseLike<number | undefined>
    | number
    | undefined;
};

export function getEmbeddingModelMaxInputBytesPerCall(model: EmbeddingModelV3) {
  return (model as EmbeddingModelWithMaxInputBytesPerCall)[
    EXPERIMENTAL_EMBEDDING_MODEL_MAX_INPUT_BYTES_PER_CALL
  ];
}
