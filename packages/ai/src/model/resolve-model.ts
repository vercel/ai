import { gateway } from '@ai-sdk/gateway';
import {
  EmbeddingModelV3,
  LanguageModelV3,
  ProviderV3,
  SpeechModelV3,
  TranscriptionModelV3,
} from '@ai-sdk/provider';
import { UnsupportedModelVersionError } from '../error';
import { EmbeddingModel } from '../types/embedding-model';
import { LanguageModel } from '../types/language-model';
import { SpeechModel } from '../types/speech-model';
import { TranscriptionModel } from '../types/transcription-model';
import { asEmbeddingModelV3 } from './as-embedding-model-v3';
import { asLanguageModelV3 } from './as-language-model-v3';
import { asSpeechModelV3 } from './as-speech-model-v3';
import { asTranscriptionModelV3 } from './as-transcription-model-v3';

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

    return asEmbeddingModelV3(model);
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

function getGlobalProvider(): ProviderV3 {
  return globalThis.AI_SDK_DEFAULT_PROVIDER ?? gateway;
}
