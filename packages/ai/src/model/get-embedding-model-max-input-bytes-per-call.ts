import type { EmbeddingModelV4 } from '@ai-sdk/provider';
import { EXPERIMENTAL_EMBEDDING_MODEL_MAX_INPUT_BYTES_PER_CALL } from '@ai-sdk/provider-utils';

export type EmbeddingModelWithMaxInputBytesPerCall = EmbeddingModelV4 & {
  readonly [EXPERIMENTAL_EMBEDDING_MODEL_MAX_INPUT_BYTES_PER_CALL]?:
    | PromiseLike<number | undefined>
    | number
    | undefined;
};

export function getEmbeddingModelMaxInputBytesPerCall(model: EmbeddingModelV4) {
  return (model as EmbeddingModelWithMaxInputBytesPerCall)[
    EXPERIMENTAL_EMBEDDING_MODEL_MAX_INPUT_BYTES_PER_CALL
  ];
}
