import { gateway } from '@ai-sdk/gateway';
import {
  EmbeddingModelV3,
  LanguageModelV3,
  ProviderV2,
} from '@ai-sdk/provider';
import { UnsupportedModelVersionError } from '../error';
import { EmbeddingModel } from '../types/embedding-model';
import { LanguageModel } from '../types/language-model';

export function resolveLanguageModel(model: LanguageModel): LanguageModelV3 {
  if (typeof model !== 'string') {
    return ensureLanguageModelV3(model as any);
  }

  const resolved = getGlobalProvider().languageModel(model);
  return ensureLanguageModelV3(resolved as any);
}

export function resolveEmbeddingModel<VALUE = string>(
  model: EmbeddingModel<VALUE>,
): EmbeddingModelV3<VALUE> {
  if (typeof model !== 'string') {
    return ensureEmbeddingModelV3<VALUE>(model as any);
  }

  // TODO AI SDK 6: figure out how to cleanly support different generic types
  const resolved = getGlobalProvider().textEmbeddingModel(model);
  return ensureEmbeddingModelV3<VALUE>(resolved as any);
}

function ensureLanguageModelV3(model: any): LanguageModelV3 {
  if (model?.specificationVersion === 'v3') return model;
  if (model?.specificationVersion === 'v2') {
    const v2 = model as any;
    const adapted: LanguageModelV3 = {
      specificationVersion: 'v3',
      provider: v2.provider,
      modelId: v2.modelId,
      supportedUrls: v2.supportedUrls,
      async doGenerate(options) {
        const res = await v2.doGenerate(options as any);
        return {
          content: res.content as any,
          finishReason: res.finishReason as any,
          usage: res.usage as any,
          providerMetadata: res.providerMetadata,
          request: res.request,
          response: res.response as any,
          warnings: res.warnings as any,
        };
      },
      async doStream(options) {
        const res = await v2.doStream(options as any);
        return {
          stream: res.stream as any,
          request: res.request,
          response: res.response as any,
        };
      },
    };
    return adapted;
  }

  throw new UnsupportedModelVersionError({
    version: String(model?.specificationVersion),
    provider: model?.provider ?? 'unknown',
    modelId: model?.modelId ?? 'unknown',
  });
}

function ensureEmbeddingModelV3<VALUE>(model: any): EmbeddingModelV3<VALUE> {
  if (model?.specificationVersion === 'v3') return model as EmbeddingModelV3<VALUE>;
  if (model?.specificationVersion === 'v2') {
    const v2 = model as any;
    const adapted: EmbeddingModelV3<VALUE> = {
      specificationVersion: 'v3',
      provider: v2.provider,
      modelId: v2.modelId,
      maxEmbeddingsPerCall: v2.maxEmbeddingsPerCall,
      supportsParallelCalls: v2.supportsParallelCalls,
      async doEmbed(options) {
        const res = await v2.doEmbed(options);
        return {
          embeddings: res.embeddings as any,
          usage: res.usage,
          providerMetadata: res.providerMetadata,
          response: res.response,
        };
      },
    };
    return adapted;
  }

  throw new UnsupportedModelVersionError({
    version: String(model?.specificationVersion),
    provider: model?.provider ?? 'unknown',
    modelId: model?.modelId ?? 'unknown',
  });
}

function getGlobalProvider(): ProviderV2 {
  return globalThis.AI_SDK_DEFAULT_PROVIDER ?? gateway;
}
