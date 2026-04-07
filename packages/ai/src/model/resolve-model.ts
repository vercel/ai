import { gateway } from '@ai-sdk/gateway';
import {
<<<<<<< HEAD
  EmbeddingModelV3,
  Experimental_VideoModelV3,
  ImageModelV3,
  LanguageModelV3,
  ProviderV3,
  SpeechModelV3,
  TranscriptionModelV3,
=======
  EmbeddingModelV4,
  Experimental_VideoModelV4,
  ImageModelV4,
  LanguageModelV4,
  ProviderV4,
  RerankingModelV4,
  SpeechModelV4,
  TranscriptionModelV4,
>>>>>>> 664a0eb8d (feat(ai/core): support plain string model IDs in rerank() (#14203))
} from '@ai-sdk/provider';
import { UnsupportedModelVersionError } from '../error';
import { EmbeddingModel } from '../types/embedding-model';
import { LanguageModel } from '../types/language-model';
import { SpeechModel } from '../types/speech-model';
import { TranscriptionModel } from '../types/transcription-model';
<<<<<<< HEAD
import { asEmbeddingModelV3 } from './as-embedding-model-v3';
import { asImageModelV3 } from './as-image-model-v3';
import { asLanguageModelV3 } from './as-language-model-v3';
import { asSpeechModelV3 } from './as-speech-model-v3';
import { asTranscriptionModelV3 } from './as-transcription-model-v3';
=======
import { asEmbeddingModelV4 } from './as-embedding-model-v4';
import { asImageModelV4 } from './as-image-model-v4';
import { asLanguageModelV4 } from './as-language-model-v4';
import { asRerankingModelV4 } from './as-reranking-model-v4';
import { asSpeechModelV4 } from './as-speech-model-v4';
import { asTranscriptionModelV4 } from './as-transcription-model-v4';
import { asVideoModelV4 } from './as-video-model-v4';
import { asProviderV4 } from './as-provider-v4';
>>>>>>> 664a0eb8d (feat(ai/core): support plain string model IDs in rerank() (#14203))
import { ImageModel } from '../types/image-model';
import { RerankingModel } from '../types/reranking-model';
import { VideoModel } from '../types/video-model';

export function resolveLanguageModel(model: LanguageModel): LanguageModelV3 {
  if (typeof model !== 'string') {
    if (
      model.specificationVersion !== 'v3' &&
      model.specificationVersion !== 'v2'
    ) {
      const unsupportedModel: any = model;
      throw new UnsupportedModelVersionError({
        version: unsupportedModel.specificationVersion,
        provider: unsupportedModel.provider,
        modelId: unsupportedModel.modelId,
      });
    }

    return asLanguageModelV3(model);
  }

  return getGlobalProvider().languageModel(model);
}

export function resolveEmbeddingModel(model: EmbeddingModel): EmbeddingModelV3 {
  if (typeof model !== 'string') {
    if (
      model.specificationVersion !== 'v3' &&
      model.specificationVersion !== 'v2'
    ) {
      const unsupportedModel: any = model;
      throw new UnsupportedModelVersionError({
        version: unsupportedModel.specificationVersion,
        provider: unsupportedModel.provider,
        modelId: unsupportedModel.modelId,
      });
    }

    return asEmbeddingModelV3(model);
  }

  return getGlobalProvider().embeddingModel(model);
}

export function resolveTranscriptionModel(
  model: TranscriptionModel,
): TranscriptionModelV3 | undefined {
  if (typeof model !== 'string') {
    if (
      model.specificationVersion !== 'v3' &&
      model.specificationVersion !== 'v2'
    ) {
      const unsupportedModel: any = model;
      throw new UnsupportedModelVersionError({
        version: unsupportedModel.specificationVersion,
        provider: unsupportedModel.provider,
        modelId: unsupportedModel.modelId,
      });
    }
    return asTranscriptionModelV3(model);
  }

  return getGlobalProvider().transcriptionModel?.(model);
}

export function resolveSpeechModel(
  model: SpeechModel,
): SpeechModelV3 | undefined {
  if (typeof model !== 'string') {
    if (
      model.specificationVersion !== 'v3' &&
      model.specificationVersion !== 'v2'
    ) {
      const unsupportedModel: any = model;
      throw new UnsupportedModelVersionError({
        version: unsupportedModel.specificationVersion,
        provider: unsupportedModel.provider,
        modelId: unsupportedModel.modelId,
      });
    }
    return asSpeechModelV3(model);
  }

  return getGlobalProvider().speechModel?.(model);
}

export function resolveImageModel(model: ImageModel): ImageModelV3 {
  if (typeof model !== 'string') {
    if (
      model.specificationVersion !== 'v3' &&
      model.specificationVersion !== 'v2'
    ) {
      const unsupportedModel: any = model;
      throw new UnsupportedModelVersionError({
        version: unsupportedModel.specificationVersion,
        provider: unsupportedModel.provider,
        modelId: unsupportedModel.modelId,
      });
    }

    return asImageModelV3(model);
  }

  return getGlobalProvider().imageModel(model);
}

export function resolveVideoModel(
  model: VideoModel,
): Experimental_VideoModelV3 {
  if (typeof model === 'string') {
    const provider = getGlobalProvider();
    // TODO AI SDK v7
    // @ts-expect-error - videoModel support is experimental
    const videoModel = provider.videoModel;

    if (!videoModel) {
      throw new Error(
        'The default provider does not support video models. ' +
          'Please use a Experimental_VideoModelV3 object from a provider (e.g., vertex.video("model-id")).',
      );
    }

    return videoModel(model);
  }

  if (model.specificationVersion !== 'v3') {
    const unsupportedModel: any = model;
    throw new UnsupportedModelVersionError({
      version: unsupportedModel.specificationVersion,
      provider: unsupportedModel.provider,
      modelId: unsupportedModel.modelId,
    });
  }

  return model;
}

<<<<<<< HEAD
function getGlobalProvider(): ProviderV3 {
  return globalThis.AI_SDK_DEFAULT_PROVIDER ?? gateway;
=======
export function resolveRerankingModel(model: RerankingModel): RerankingModelV4 {
  if (typeof model === 'string') {
    const provider = getGlobalProvider();
    const rerankingModel = provider.rerankingModel;

    if (!rerankingModel) {
      throw new Error(
        'The default provider does not support reranking models. ' +
          'Please use a RerankingModel object from a provider (e.g., gateway.rerankingModel("model-id")).',
      );
    }

    return rerankingModel(model);
  }

  if (
    model.specificationVersion !== 'v4' &&
    model.specificationVersion !== 'v3'
  ) {
    const unsupportedModel: any = model;
    throw new UnsupportedModelVersionError({
      version: unsupportedModel.specificationVersion,
      provider: unsupportedModel.provider,
      modelId: unsupportedModel.modelId,
    });
  }

  return asRerankingModelV4(model);
}

function getGlobalProvider(): ProviderV4 {
  const provider = globalThis.AI_SDK_DEFAULT_PROVIDER ?? gateway;
  return asProviderV4(provider);
>>>>>>> 664a0eb8d (feat(ai/core): support plain string model IDs in rerank() (#14203))
}
