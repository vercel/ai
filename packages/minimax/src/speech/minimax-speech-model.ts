import type {
  SpeechModelV4,
  SharedV4Warning,
  SpeechModelV4CallOptions,
  SpeechModelV4Result,
} from '@ai-sdk/provider';
import {
  resolve,
  combineHeaders,
  createBinaryResponseHandler,
  createJsonResponseHandler,
  createStatusCodeErrorResponseHandler,
  getFromApi,
  parseProviderOptions,
  postJsonToApi,
  serializeModelOptions,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
  createJsonErrorResponseHandler,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import {
  minimaxErrorResponseSchema,
  minimaxSpeechModelResponseSchema,
} from './minimax-speech-model-api';
import {
  minimaxSpeechProviderOptions,
  type MinimaxSpeechModelId,
} from './minimax-speech-model-options';

export interface MinimaxSpeechModelConfig {
  provider: string;
  baseURL: string;
  fetch?: FetchFunction;
  headers?: Resolvable<Record<string, string | undefined>>;
}

export class MinimaxSpeechModel implements SpeechModelV4 {
  readonly specificationVersion = 'v4';

  get provider(): string {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: MinimaxSpeechModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: MinimaxSpeechModelId;
    config: MinimaxSpeechModelConfig;
  }) {
    return new MinimaxSpeechModel(options.modelId, options.config);
  }

  private async getHeaders(headers?: Record<string, string | undefined>) {
    const resolvedHeaders = await resolve(this.config.headers);
    return combineHeaders(
      {
        'Content-Type': 'application/json',
      },
      resolvedHeaders,
      headers,
    );
  }

  constructor(
    readonly modelId: MinimaxSpeechModelId,
    private readonly config: MinimaxSpeechModelConfig,
  ) {}

  async doGenerate({
    text,
    headers,
    abortSignal,
    outputFormat,
    providerOptions,
  }: SpeechModelV4CallOptions): Promise<SpeechModelV4Result> {
    const warnings: SharedV4Warning[] = [];
    if (outputFormat && outputFormat !== 'url' && outputFormat !== 'hex') {
      warnings.push({
        type: 'unsupported',
        feature: 'outputFormat',
        details: `Unsupported outputFormat "${outputFormat}". Supported formats are "url" and "hex".`,
      });
    }

    const resolvedHeaders = await this.getHeaders(headers);
    const minimaxOptions = await parseProviderOptions({
      provider: 'minimax',
      providerOptions,
      schema: minimaxSpeechProviderOptions,
    });

    const body = {
      model: this.modelId,
      text,
      stream: false,
      ...minimaxOptions,
      output_format: outputFormat ?? minimaxOptions?.output_format ?? 'hex',
    };

    const {
      value: response,
      rawValue,
      responseHeaders,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/v1/t2a_v2`,
      headers: resolvedHeaders,
      body,
      abortSignal,
      fetch: this.config.fetch,
      successfulResponseHandler: createJsonResponseHandler(
        minimaxSpeechModelResponseSchema,
      ),
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: minimaxErrorResponseSchema,
        errorToMessage: error => error.error.message,
      }),
    });

    const audioDataFormat =
      outputFormat ?? minimaxOptions?.output_format ?? 'hex';

    let audioData: string | Uint8Array = 'undefined';
    if (audioDataFormat === 'url' && response.data?.audio) {
      const { value: audio } = await getFromApi({
        url: response.data.audio,
        validateUrl: true,
        trustedOrigin: this.config.baseURL,
        abortSignal,
        fetch: this.config.fetch,
        failedResponseHandler: createStatusCodeErrorResponseHandler(),
        successfulResponseHandler: createBinaryResponseHandler(),
      });
      audioData = audio;
    } else if (audioDataFormat === 'hex' && response.data?.audio) {
      audioData = response.data?.audio;
    }

    return {
      audio: audioData,
      warnings,
      response: {
        modelId: this.modelId,
        timestamp: new Date(),
        headers: responseHeaders,
        body: rawValue,
      },
      request: {
        body: JSON.stringify(body),
      },
    };
  }
}
