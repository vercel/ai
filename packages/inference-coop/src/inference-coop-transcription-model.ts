import type { SharedV4Warning, TranscriptionModelV4 } from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  lazySchema,
  mediaTypeToExtension,
  parseProviderOptions,
  postFormDataToApi,
  resolve,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
  type Resolvable,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { INFERENCE_COOP_DEFAULT_BASE_URL } from './inference-coop-config';
import { inferenceCoopFailedResponseHandler } from './inference-coop-error';
import {
  inferenceCoopTranscriptionModelOptions,
  type InferenceCoopTranscriptionModelId,
} from './inference-coop-transcription-model-options';

interface InferenceCoopTranscriptionModelConfig {
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
 * Speech-to-text over the co-op gateway's `/audio/transcriptions` endpoint
 * (multipart form, OpenAI Whisper format). The gateway always responds with
 * a JSON transcript carrying `text`, `language`, `duration`, and `segments`.
 */
export class InferenceCoopTranscriptionModel implements TranscriptionModelV4 {
  readonly specificationVersion = 'v4';

  get provider(): string {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: InferenceCoopTranscriptionModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: InferenceCoopTranscriptionModelId;
    config: InferenceCoopTranscriptionModelConfig;
  }) {
    return new InferenceCoopTranscriptionModel(options.modelId, options.config);
  }

  constructor(
    readonly modelId: InferenceCoopTranscriptionModelId,
    private readonly config: InferenceCoopTranscriptionModelConfig,
  ) {}

  private async getArgs({
    audio,
    mediaType,
    providerOptions,
  }: Parameters<TranscriptionModelV4['doGenerate']>[0]) {
    const warnings: SharedV4Warning[] = [];

    const coopOptions = await parseProviderOptions({
      provider: 'inference-coop',
      providerOptions,
      schema: inferenceCoopTranscriptionModelOptions,
    });

    const formData = new FormData();
    const blob =
      audio instanceof Uint8Array
        ? new Blob([audio as Uint8Array<ArrayBuffer>])
        : new Blob([convertBase64ToUint8Array(audio)]);

    formData.append('model', this.modelId);
    const fileExtension = mediaTypeToExtension(mediaType);
    formData.append(
      'file',
      new File([blob], 'audio', { type: mediaType }),
      `audio.${fileExtension}`,
    );

    if (coopOptions?.language != null) {
      formData.append('language', coopOptions.language);
    }
    if (coopOptions?.prompt != null) {
      formData.append('prompt', coopOptions.prompt);
    }
    if (coopOptions?.temperature != null) {
      formData.append('temperature', String(coopOptions.temperature));
    }

    return { formData, warnings };
  }

  async doGenerate(
    options: Parameters<TranscriptionModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV4['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { formData, warnings } = await this.getArgs(options);

    const {
      value: response,
      responseHeaders,
      rawValue: rawResponse,
    } = await postFormDataToApi({
      url: `${
        this.config.baseURL ?? INFERENCE_COOP_DEFAULT_BASE_URL
      }/audio/transcriptions`,
      headers: combineHeaders(
        await resolve(this.config.headers),
        options.headers,
      ),
      formData,
      failedResponseHandler: inferenceCoopFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        inferenceCoopTranscriptionResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return {
      text: response.text,
      segments:
        response.segments?.map(segment => ({
          text: segment.text,
          startSecond: segment.start,
          endSecond: segment.end,
        })) ??
        response.words?.map(word => ({
          text: word.word,
          startSecond: word.start,
          endSecond: word.end,
        })) ??
        [],
      language: response.language ?? undefined,
      durationInSeconds:
        response.duration != null ? Number(response.duration) : undefined,
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
        body: rawResponse,
      },
    };
  }
}

// Minimal response schema. The gateway returns `duration` as a string and
// leaves `words` null on the default response (verified 2026-11), so both
// shapes are tolerated.
const inferenceCoopTranscriptionResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      text: z.string(),
      language: z.string().nullish(),
      duration: z.union([z.string(), z.number()]).nullish(),
      segments: z
        .array(
          z.object({
            start: z.number(),
            end: z.number(),
            text: z.string(),
          }),
        )
        .nullish(),
      words: z
        .array(
          z.object({
            word: z.string(),
            start: z.number(),
            end: z.number(),
          }),
        )
        .nullish(),
    }),
  ),
);
