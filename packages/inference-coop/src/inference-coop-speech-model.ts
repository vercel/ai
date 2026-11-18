import type { SharedV4Warning, SpeechModelV4 } from '@ai-sdk/provider';
import {
  combineHeaders,
  createBinaryResponseHandler,
  postJsonToApi,
  resolve,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { INFERENCE_COOP_DEFAULT_BASE_URL } from './inference-coop-config';
import { inferenceCoopFailedResponseHandler } from './inference-coop-error';
import type { InferenceCoopSpeechModelId } from './inference-coop-speech-model-options';

interface InferenceCoopSpeechModelConfig {
  provider: string;

  /**
   * Base URL of the gateway. Serializable, so the model config survives
   * workflow serialization (functions like `headers` and `fetch` do not).
   */
  baseURL: string | undefined;

  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

/**
 * Text-to-speech over the co-op gateway's `/audio/speech` endpoint
 * (OpenAI speech format). The endpoint accepts `model`, `input`, `voice`,
 * `response_format`, and `speed`, and returns raw audio bytes (WAV by
 * default). `voice` is required by the gateway.
 */
export class InferenceCoopSpeechModel implements SpeechModelV4 {
  readonly specificationVersion = 'v4';

  get provider(): string {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: InferenceCoopSpeechModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: InferenceCoopSpeechModelId;
    config: InferenceCoopSpeechModelConfig;
  }) {
    return new InferenceCoopSpeechModel(options.modelId, options.config);
  }

  constructor(
    readonly modelId: InferenceCoopSpeechModelId,
    private readonly config: InferenceCoopSpeechModelConfig,
  ) {}

  private getArgs({
    text,
    voice,
    outputFormat,
    instructions,
    speed,
    language,
  }: Parameters<SpeechModelV4['doGenerate']>[0]) {
    const warnings: SharedV4Warning[] = [];

    if (instructions != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'instructions',
        details:
          'The Inference Cooperative speech endpoint does not support the `instructions` option.',
      });
    }

    if (language != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'language',
        details:
          'The Inference Cooperative speech endpoint does not support the `language` option. Use a language-specific voice instead (e.g. `fr_female`).',
      });
    }

    const requestBody = {
      model: this.modelId,
      input: text,
      voice,
      ...(outputFormat != null ? { response_format: outputFormat } : {}),
      ...(speed != null ? { speed } : {}),
    };

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
      rawValue,
    } = await postJsonToApi<Uint8Array>({
      url: `${
        this.config.baseURL ?? INFERENCE_COOP_DEFAULT_BASE_URL
      }/audio/speech`,
      headers: combineHeaders(
        await resolve(this.config.headers),
        options.headers,
      ),
      body: requestBody,
      failedResponseHandler: inferenceCoopFailedResponseHandler,
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
        body: rawValue,
      },
    };
  }
}
