import type { SpeechModelV4, SharedV4Warning } from '@ai-sdk/provider';
import {
  combineHeaders,
  createBinaryResponseHandler,
  parseProviderOptions,
  postJsonToApi,
  serializeModelOptions,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { mistralSpeechModelOptions } from './mistral-speech-model-options';
import { mistralFailedResponseHandler } from './mistral-error';
import type { MistralSpeechModelId } from './mistral-speech-options';

type MistralSpeechConfig = {
  provider: string;
  baseURL: string;
  headers?: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
};

export class MistralSpeechModel implements SpeechModelV4 {
  readonly specificationVersion = 'v4';
  readonly modelId: MistralSpeechModelId;

  private readonly config: MistralSpeechConfig;

  get provider(): string {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: MistralSpeechModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: MistralSpeechModelId;
    config: MistralSpeechConfig;
  }) {
    return new MistralSpeechModel(options.modelId, options.config);
  }

  constructor(modelId: MistralSpeechModelId, config: MistralSpeechConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  private async getArgs({
    text,
    voice = 'coeur_de_lion',
    outputFormat = 'mp3',
    speed,
    language,
    providerOptions,
  }: Parameters<SpeechModelV4['doGenerate']>[0]) {
    const warnings: SharedV4Warning[] = [];

    await parseProviderOptions({
      provider: 'mistral',
      providerOptions,
      schema: mistralSpeechModelOptions,
    });

    const requestBody: Record<string, unknown> = {
      model: this.modelId,
      input: text,
      voice,
      response_format: 'mp3',
    };

    if (outputFormat) {
      if (['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'].includes(outputFormat)) {
        requestBody.response_format = outputFormat;
      } else {
        warnings.push({
          type: 'unsupported',
          feature: 'outputFormat',
          details: `Unsupported output format: ${outputFormat}. Using mp3 instead.`,
        });
      }
    }

    if (speed != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'speed',
        details: 'Mistral speech models do not support speed adjustment.',
      });
    }

    if (language != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'language',
        details:
          'Mistral speech models do not support explicit language selection.',
      });
    }

    return { requestBody, warnings };
  }

  async doGenerate(
    options: Parameters<SpeechModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV4['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { requestBody, warnings } = await this.getArgs(options);

    const {
      value: audio,
      responseHeaders,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/audio/speech`,
      headers: combineHeaders(this.config.headers?.(), options.headers),
      body: requestBody,
      failedResponseHandler: mistralFailedResponseHandler,
      successfulResponseHandler: createBinaryResponseHandler(),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return {
      audio,
      warnings,
      request: {
        body: JSON.stringify(requestBody),
      },
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
        body: rawResponse,
      },
    };
  }
}
