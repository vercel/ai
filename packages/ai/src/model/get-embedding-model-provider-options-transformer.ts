import type { EmbeddingModelV3 } from '@ai-sdk/provider';
import {
  EXPERIMENTAL_EMBEDDING_MODEL_PROVIDER_OPTIONS_TRANSFORMER,
  type EmbeddingModelProviderOptionsTransformer,
} from '@ai-sdk/provider-utils';

export type EmbeddingModelWithProviderOptionsTransformer = EmbeddingModelV3 & {
  readonly [EXPERIMENTAL_EMBEDDING_MODEL_PROVIDER_OPTIONS_TRANSFORMER]?: EmbeddingModelProviderOptionsTransformer;
};

export function getEmbeddingModelProviderOptionsTransformer(
  model: EmbeddingModelV3,
) {
  return (model as EmbeddingModelWithProviderOptionsTransformer)[
    EXPERIMENTAL_EMBEDDING_MODEL_PROVIDER_OPTIONS_TRANSFORMER
  ];
}
