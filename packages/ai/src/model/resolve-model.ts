import { gateway } from '@ai-sdk/gateway';
import {
  EmbeddingModelV2,
  EmbeddingModelV3,
  LanguageModelV2,
  LanguageModelV3,
  ProviderV3,
  SpeechModelV2,
  SpeechModelV3,
  TranscriptionModelV2,
  TranscriptionModelV3,
} from '@ai-sdk/provider';
import { UnsupportedModelVersionError } from '../error';
import { EmbeddingModel } from '../types/embedding-model';
import { LanguageModel } from '../types/language-model';
import { SpeechModel } from '../types/speech-model';
import { TranscriptionModel } from '../types/transcription-model';

function transformToV3LanguageModel(model: LanguageModelV2): LanguageModelV3 {
  return new Proxy(model, {
    get(target, prop: keyof LanguageModelV2) {
      if (prop === 'specificationVersion') return 'v3';
      return target[prop];
    },
  }) as unknown as LanguageModelV3;
}

function transformToV3EmbeddingModel<VALUE>(
  model: EmbeddingModelV2<VALUE>,
): EmbeddingModelV3<VALUE> {
  return new Proxy(model, {
    get(target, prop: keyof EmbeddingModelV2<VALUE>) {
      if (prop === 'specificationVersion') return 'v3';
      return target[prop];
    },
  }) as unknown as EmbeddingModelV3<VALUE>;
}

function transformToV3TranscriptionModel(
  model: TranscriptionModelV2,
): TranscriptionModelV3 {
  return new Proxy(model, {
    get(target, prop: keyof TranscriptionModelV2) {
      if (prop === 'specificationVersion') return 'v3';
      return target[prop];
    },
  }) as unknown as TranscriptionModelV3;
}

function transformToV3SpeechModel(model: SpeechModelV2): SpeechModelV3 {
  return new Proxy(model, {
    get(target, prop: keyof SpeechModelV2) {
      if (prop === 'specificationVersion') return 'v3';
      return target[prop];
    },
  }) as unknown as SpeechModelV3;
}

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
    if (model.specificationVersion === 'v2') {
      return transformToV3LanguageModel(model);
    }
    return model;
  }

  return getGlobalProvider().languageModel(model);
}

export function resolveEmbeddingModel<VALUE = string>(
  model: EmbeddingModel<VALUE>,
): EmbeddingModelV3<VALUE> {
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
    if (model.specificationVersion === 'v2') {
      return transformToV3EmbeddingModel(model);
    }

    return model;
  }

  // TODO AI SDK 6: figure out how to cleanly support different generic types
  return getGlobalProvider().textEmbeddingModel(
    model,
  ) as EmbeddingModelV3<VALUE>;
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
    if (model.specificationVersion === 'v2') {
      return transformToV3TranscriptionModel(model);
    }
    return model;
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
    if (model.specificationVersion === 'v2') {
      return transformToV3SpeechModel(model);
    }
    return model;
  }

  return getGlobalProvider().speechModel?.(model);
}

function getGlobalProvider(): ProviderV3 {
  return globalThis.AI_SDK_DEFAULT_PROVIDER ?? gateway;
}
