import {
  EmbeddingModelV2,
  EmbeddingModelV2CallOptions,
  EmbeddingModelV2Middleware,
} from '@ai-sdk/provider';
import { asArray } from '../../util/as-array';

/**
 * Wraps a EmbeddingModelV2 instance with middleware functionality.
 * This function allows you to apply middleware to transform parameters,
 * wrap embed operations of an embedding model.
 *
 * @param options - Configuration options for wrapping the embedding model.
 * @param options.model - The original EmbeddingModelV2 instance to be wrapped.
 * @param options.middleware - The middleware to be applied to the embedding model. When multiple middlewares are provided, the first middleware will transform the input first, and the last middleware will be wrapped directly around the model.
 * @param options.modelId - Optional custom model ID to override the original model's ID.
 * @param options.providerId - Optional custom provider ID to override the original model's provider.
 * @returns A new EmbeddingModelV2 instance with middleware applied.
 */
export const wrapEmbeddingModel = <VALUE>({
  model,
  middleware: middlewareArg,
  modelId,
  providerId,
}: {
  model: EmbeddingModelV2<VALUE>;
  middleware:
    | EmbeddingModelV2Middleware<VALUE>
    | EmbeddingModelV2Middleware<VALUE>[];
  modelId?: string;
  providerId?: string;
}): EmbeddingModelV2<VALUE> => {
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
  model: EmbeddingModelV2<VALUE>;
  middleware: EmbeddingModelV2Middleware<VALUE>;
  modelId?: string;
  providerId?: string;
}): EmbeddingModelV2<VALUE> => {
  async function doTransform({
    params,
  }: {
    params: EmbeddingModelV2CallOptions<VALUE>;
  }) {
    return transformParams ? await transformParams({ params }) : params;
  }

  return {
    specificationVersion: 'v2',

    provider: providerId ?? model.provider,
    modelId: modelId ?? model.modelId,

    maxEmbeddingsPerCall: model.maxEmbeddingsPerCall,
    supportsParallelCalls: model.supportsParallelCalls,

    async doEmbed(
      params: EmbeddingModelV2CallOptions<VALUE>,
    ): Promise<Awaited<ReturnType<EmbeddingModelV2<VALUE>['doEmbed']>>> {
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
