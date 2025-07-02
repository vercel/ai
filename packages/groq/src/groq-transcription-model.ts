import {
  TranscriptionModelV2,
  TranscriptionModelV2CallWarning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  parseProviderOptions,
  postFormDataToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { GroqConfig } from './groq-config';
import { groqFailedResponseHandler } from './groq-error';
import { GroqTranscriptionModelId } from './groq-transcription-options';
import { GroqTranscriptionAPITypes } from './groq-api-types';

// https://console.groq.com/docs/speech-to-text
const groqProviderOptionsSchema = z.object({
  language: z.string().nullish(),
  prompt: z.string().nullish(),
  responseFormat: z.string().nullish(),
  temperature: z.number().min(0).max(1).nullish(),
  timestampGranularities: z.array(z.string()).nullish(),
});

export type GroqTranscriptionCallOptions = z.infer<
  typeof groqProviderOptionsSchema
>;

interface GroqTranscriptionModelConfig extends GroqConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class GroqTranscriptionModel implements TranscriptionModelV2 {
  readonly specificationVersion = 'v2';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: GroqTranscriptionModelId,
    private readonly config: GroqTranscriptionModelConfig,
  ) {}

  private async getArgs({
    audio,
    mediaType,
    providerOptions,
  }: Parameters<TranscriptionModelV2['doGenerate']>[0]) {
    const warnings: TranscriptionModelV2CallWarning[] = [];

    // Parse provider options
    const groqOptions = await parseProviderOptions({
      provider: 'groq',
      providerOptions,
      schema: groqProviderOptionsSchema,
    });

    // Create form data with base fields
    const formData = new FormData();
    const blob =
      audio instanceof Uint8Array
        ? new Blob([audio])
        : new Blob([convertBase64ToUint8Array(audio)]);

    formData.append('model', this.modelId);
    formData.append('file', new File([blob], 'audio', { type: mediaType }));

    // Add provider-specific options
    if (groqOptions) {
      const transcriptionModelOptions: Omit<
        GroqTranscriptionAPITypes,
        'model'
      > = {
        language: groqOptions.language ?? undefined,
        prompt: groqOptions.prompt ?? undefined,
        response_format: groqOptions.responseFormat ?? undefined,
        temperature: groqOptions.temperature ?? undefined,
        timestamp_granularities:
          groqOptions.timestampGranularities ?? undefined,
      };

      for (const key in transcriptionModelOptions) {
        const value =
          transcriptionModelOptions[
            key as keyof Omit<GroqTranscriptionAPITypes, 'model'>
          ];
        if (value !== undefined) {
          formData.append(key, String(value));
        }
      }
    }

    return {
      formData,
      warnings,
    };
  }

  async doGenerate(
    options: Parameters<TranscriptionModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV2['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { formData, warnings } = await this.getArgs(options);

    const {
      value: response,
      responseHeaders,
      rawValue: rawResponse,
    } = await postFormDataToApi({
      url: this.config.url({
        path: '/audio/transcriptions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      formData,
      failedResponseHandler: groqFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        groqTranscriptionResponseSchema,
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
        })) ?? [],
      language: response.language,
      durationInSeconds: response.duration,
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

const groqTranscriptionResponseSchema = z.object({
  task: z.string(),
  language: z.string(),
  duration: z.number(),
  text: z.string(),
  segments: z.array(
    z.object({
      id: z.number(),
      seek: z.number(),
      start: z.number(),
      end: z.number(),
      text: z.string(),
      tokens: z.array(z.number()),
      temperature: z.number(),
      avg_logprob: z.number(),
      compression_ratio: z.number(),
      no_speech_prob: z.number(),
    }),
  ),
  x_groq: z.object({
    id: z.string(),
  }),
});
