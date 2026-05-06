import type {
  SharedV3Warning,
  TranscriptionModelV3,
  TranscriptionModelV3CallOptions,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  mediaTypeToExtension,
  parseProviderOptions,
  postFormDataToApi,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { mistralFailedResponseHandler } from './mistral-error';
import {
  mistralTranscriptionModelOptions,
  type MistralTranscriptionModelId,
  type MistralTranscriptionModelOptions,
} from './mistral-transcription-options';

export type MistralTranscriptionCallOptions = Omit<
  TranscriptionModelV3CallOptions,
  'providerOptions'
> & {
  providerOptions?: {
    mistral?: MistralTranscriptionModelOptions;
  };
};

type MistralTranscriptionConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
};

export class MistralTranscriptionModel implements TranscriptionModelV3 {
  readonly specificationVersion = 'v3';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: MistralTranscriptionModelId,
    private readonly config: MistralTranscriptionConfig,
  ) {}

  private async getArgs({
    audio,
    mediaType,
    providerOptions,
  }: MistralTranscriptionCallOptions) {
    const warnings: SharedV3Warning[] = [];

    const mistralOptions = await parseProviderOptions({
      provider: 'mistral',
      providerOptions,
      schema: mistralTranscriptionModelOptions,
    });

    const formData = new FormData();
    const blob =
      audio instanceof Uint8Array
        ? new Blob([audio])
        : new Blob([convertBase64ToUint8Array(audio)]);

    formData.append('model', this.modelId);
    const fileExtension = mediaTypeToExtension(mediaType);
    formData.append(
      'file',
      new File([blob], 'audio', { type: mediaType }),
      `audio.${fileExtension}`,
    );

    if (mistralOptions) {
      const transcriptionModelOptions = {
        language: mistralOptions.language,
        temperature: mistralOptions.temperature,
        timestamp_granularities: mistralOptions.timestampGranularities,
        diarize: mistralOptions.diarize,
        context_bias: mistralOptions.contextBias,
      };

      for (const [key, value] of Object.entries(transcriptionModelOptions)) {
        if (value != null) {
          if (Array.isArray(value)) {
            for (const item of value) {
              formData.append(key, String(item));
            }
          } else {
            formData.append(key, String(value));
          }
        }
      }
    }

    return {
      formData,
      warnings,
    };
  }

  async doGenerate(
    options: MistralTranscriptionCallOptions,
  ): Promise<Awaited<ReturnType<TranscriptionModelV3['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { formData, warnings } = await this.getArgs(options);

    const {
      value: response,
      responseHeaders,
      rawValue: rawResponse,
    } = await postFormDataToApi({
      url: `${this.config.baseURL}/audio/transcriptions`,
      headers: combineHeaders(this.config.headers(), options.headers),
      formData,
      failedResponseHandler: mistralFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        mistralTranscriptionResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const segments =
      response.segments?.map(segment => ({
        text: segment.text,
        startSecond: segment.start,
        endSecond: segment.end,
      })) ?? [];
    const lastSegment = segments.at(-1);

    return {
      text: response.text,
      segments,
      language: response.language ?? undefined,
      durationInSeconds:
        lastSegment?.endSecond ??
        response.usage?.prompt_audio_seconds ??
        undefined,
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
        body: rawResponse,
      },
      providerMetadata:
        response.usage == null
          ? undefined
          : {
              mistral: {
                usage: response.usage,
              },
            },
    };
  }
}

const mistralTranscriptionUsageSchema = z.object({
  prompt_tokens: z.number().nullish(),
  completion_tokens: z.number().nullish(),
  total_tokens: z.number().nullish(),
  prompt_audio_seconds: z.number().nullish(),
});

const mistralTranscriptionResponseSchema = z.object({
  text: z.string(),
  language: z.string().nullish(),
  segments: z
    .array(
      z.object({
        text: z.string(),
        start: z.number(),
        end: z.number(),
      }),
    )
    .nullish(),
  usage: mistralTranscriptionUsageSchema.nullish(),
});
