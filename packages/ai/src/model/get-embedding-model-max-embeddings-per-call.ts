import type {
  EmbeddingModelV4,
  SharedV4ProviderOptions,
} from '@ai-sdk/provider';
import { EXPERIMENTAL_EMBEDDING_MODEL_DYNAMIC_MAX_EMBEDDINGS_PER_CALL } from '@ai-sdk/provider-utils';

export type EmbeddingModelWithDynamicMaxEmbeddingsPerCall = EmbeddingModelV4 & {
  readonly [EXPERIMENTAL_EMBEDDING_MODEL_DYNAMIC_MAX_EMBEDDINGS_PER_CALL]?: (options: {
    providerOptions?: SharedV4ProviderOptions;
  }) => PromiseLike<number | undefined> | number | undefined;
};

export function getEmbeddingModelDynamicMaxEmbeddingsPerCall(
  model: EmbeddingModelV4,
) {
  return (model as EmbeddingModelWithDynamicMaxEmbeddingsPerCall)[
    EXPERIMENTAL_EMBEDDING_MODEL_DYNAMIC_MAX_EMBEDDINGS_PER_CALL
  ];
}

export async function resolveEmbeddingModelMaxEmbeddingsPerCall({
  model,
  providerOptions,
}: {
  model: EmbeddingModelV4;
  providerOptions?: SharedV4ProviderOptions;
}) {
  const resolveDynamicLimit =
    getEmbeddingModelDynamicMaxEmbeddingsPerCall(model);

  return resolveDynamicLimit == null
    ? await model.maxEmbeddingsPerCall
    : await resolveDynamicLimit.call(model, { providerOptions });
}
