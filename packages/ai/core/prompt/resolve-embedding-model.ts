import { gateway } from '@ai-sdk/gateway';
import { EmbeddingModelV2 } from '@ai-sdk/provider';
import { EmbeddingModel } from '../../src/types/embedding-model';

export function resolveEmbeddingModel<VALUE = string>(
  model: EmbeddingModel<VALUE>,
): EmbeddingModelV2<VALUE> {
  if (typeof model === 'string') {
    return gateway.textEmbeddingModel(model) as EmbeddingModelV2<VALUE>;
  }

  return model as EmbeddingModelV2<VALUE>;
}
