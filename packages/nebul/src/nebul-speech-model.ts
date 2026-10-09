import {
  type SharedV4Warning,
  type SpeechModelV4,
  type SpeechModelV4CallOptions,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createBinaryResponseHandler,
  postJsonToApi,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { nebulFailedResponseHandler } from './nebul-error';
import type { NebulSpeechModelId } from './nebul-speech-options';

export type NebulSpeechModelConfig = {
  provider: string;
  baseURL: string;
  headers?: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
};

export class NebulSpeechModel implements SpeechModelV4 {
  readonly specificationVersion = 'v4';

  static [WORKFLOW_SERIALIZE](model: NebulSpeechModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: NebulSpeechModelId;
    config: NebulSpeechModelConfig;
  }) {
    return new NebulSpeechModel(options.modelId, options.config);
  }

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: NebulSpeechModelId,
    private readonly config: NebulSpeechModelConfig,
  ) {}

  async doGenerate(
    options: SpeechModelV4CallOptions,
  ): Promise<Awaited<ReturnType<SpeechModelV4['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const {
      text,
      voice = 'alloy',
      outputFormat = 'mp3',
      speed,
      instructions,
      language,
    } = options;

    const warnings: SharedV4Warning[] = [];

    const requestBody: Record<string, unknown> = {
      model: this.modelId,
      input: text,
      voice,
      response_format: outputFormat,
      speed,
      instructions,
    };

    if (!['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'].includes(outputFormat)) {
      warnings.push({
        type: 'unsupported',
        feature: 'outputFormat',
        details: `Unsupported output format: ${outputFormat}. Using mp3 instead.`,
      });
      requestBody.response_format = 'mp3';
    }

    if (language) {
      warnings.push({
        type: 'unsupported',
        feature: 'language',
        details: `Nebul speech models do not support language selection. Language parameter "${language}" was ignored.`,
      });
    }

    const {
      value: audio,
      responseHeaders,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/audio/speech`,
      headers: combineHeaders(this.config.headers?.(), options.headers),
      body: requestBody,
      failedResponseHandler: nebulFailedResponseHandler,
      successfulResponseHandler: createBinaryResponseHandler(),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return {
      audio,
      warnings,
      request: { body: JSON.stringify(requestBody) },
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
        body: rawResponse,
      },
    };
  }
}
