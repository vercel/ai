import {
  EmbeddingModelV1,
  EmbeddingModelV1CallOptions,
} from '@ai-sdk/provider';
import { asArray } from '../../util/as-array';
import { EmbeddingModelV1Middleware } from './embedding-model-v1-middleware';

/**
 * Wraps a EmbeddingModelV1 instance with middleware functionality.
 * This function allows you to apply middleware to transform parameters,
 * wrap embed operations of an embedding model.
 *
 * @param options - Configuration options for wrapping the embedding model.
 * @param options.model - The original EmbeddingModelV1 instance to be wrapped.
 * @param options.middleware - The middleware to be applied to the embedding model. When multiple middlewares are provided, the first middleware will transform the input first, and the last middleware will be wrapped directly around the model.
 * @param options.modelId - Optional custom model ID to override the original model's ID.
 * @param options.providerId - Optional custom provider ID to override the original model's provider.
 * @returns A new EmbeddingModelV1 instance with middleware applied.
 */
export const wrapEmbeddingModel = <VALUE>({
  model,
  middleware: middlewareArg,
  modelId,
  providerId,
}: {
  model: EmbeddingModelV1<VALUE>;
  middleware:
    | EmbeddingModelV1Middleware<VALUE>
    | EmbeddingModelV1Middleware<VALUE>[];
  modelId?: string;
  providerId?: string;
}): EmbeddingModelV1<VALUE> => {
  return asArray(middlewareArg)
    .reverse()
    .reduce((wrappedModel, middleware) => {
      return doWrap({ model: wrappedModel, middleware, modelId, providerId });
    }, model);
};

const doWrap = <VALUE>({
  model,
  middleware: { transformParams, wrapEmbed },
  modelId,
  providerId,
}: {
  model: EmbeddingModelV1<VALUE>;
  middleware: EmbeddingModelV1Middleware<VALUE>;
  modelId?: string;
  providerId?: string;
}): EmbeddingModelV1<VALUE> => {
  async function doTransform({
    params,
  }: {
    params: EmbeddingModelV1CallOptions<VALUE>;
  }) {
    return transformParams ? await transformParams({ params }) : params;
  }

  return {
    specificationVersion: 'v1',

    provider: providerId ?? model.provider,
    modelId: modelId ?? model.modelId,

    maxEmbeddingsPerCall: model.maxEmbeddingsPerCall,
    supportsParallelCalls: model.supportsParallelCalls,

    async doEmbed(
      params: EmbeddingModelV1CallOptions<VALUE>,
    ): Promise<Awaited<ReturnType<EmbeddingModelV1<VALUE>['doEmbed']>>> {
      const transformedParams = await doTransform({ params });
      const doEmbed = async () => model.doEmbed(transformedParams);
      return wrapEmbed
        ? wrapEmbed({
            doEmbed,
            params: transformedParams,
            model,
          })
        : doEmbed();
    },
  };
};
