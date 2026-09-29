import {
  InvalidArgumentError,
  type JSONObject,
  type SharedV4Warning,
  type TranscriptionModelV4,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  mediaTypeToExtension,
  parseProviderOptions,
  postFormDataToApi,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { mistralFailedResponseHandler } from './mistral-error';
import {
  mistralTranscriptionModelOptions,
  type MistralTranscriptionModelId,
} from './mistral-transcription-model-options';

type MistralTranscriptionModelConfig = {
  provider: string;
  baseURL: string;
  headers?: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
};

export class MistralTranscriptionModel implements TranscriptionModelV4 {
  readonly specificationVersion = 'v4';

  static [WORKFLOW_SERIALIZE](model: MistralTranscriptionModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: MistralTranscriptionModelId;
    config: MistralTranscriptionModelConfig;
  }) {
    return new MistralTranscriptionModel(options.modelId, options.config);
  }

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: MistralTranscriptionModelId,
    private readonly config: MistralTranscriptionModelConfig,
  ) {}

  private async getArgs({
    audio,
    mediaType,
    providerOptions,
  }: Parameters<TranscriptionModelV4['doGenerate']>[0]) {
    const warnings: SharedV4Warning[] = [];
    const mistralOptions = await parseProviderOptions({
      provider: 'mistral',
      providerOptions,
      schema: mistralTranscriptionModelOptions,
    });

    // Mistral documents these options as mutually incompatible. Rejecting the
    // combination locally provides a stable SDK error instead of an API 4xx.
    if (
      mistralOptions?.language != null &&
      mistralOptions.timestampGranularities != null
    ) {
      throw new InvalidArgumentError({
        argument: 'providerOptions',
        message:
          'providerOptions.mistral.language cannot be combined with providerOptions.mistral.timestampGranularities',
      });
    }

    const formData = new FormData();
    const blob =
      audio instanceof Uint8Array
        ? new Blob([audio])
        : new Blob([convertBase64ToUint8Array(audio)]);

    formData.append('model', this.modelId);
    formData.append(
      'file',
      new File([blob], 'audio', { type: mediaType }),
      `audio.${mediaTypeToExtension(mediaType)}`,
    );

    if (mistralOptions != null) {
      appendFormValue(formData, 'language', mistralOptions.language);
      appendFormValue(formData, 'temperature', mistralOptions.temperature);
      appendFormValue(
        formData,
        'timestamp_granularities',
        mistralOptions.timestampGranularities,
      );
      appendFormValue(formData, 'diarize', mistralOptions.diarize);
      appendFormValue(formData, 'context_bias', mistralOptions.contextBias);
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
      url: `${this.config.baseURL}/audio/transcriptions`,
      headers: combineHeaders(this.config.headers?.(), options.headers),
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

    const mistralMetadata: JSONObject = {};

    if (response.usage != null) {
      mistralMetadata.usage = {
        ...(response.usage.prompt_tokens != null && {
          promptTokens: response.usage.prompt_tokens,
        }),
        ...(response.usage.completion_tokens != null && {
          completionTokens: response.usage.completion_tokens,
        }),
        ...(response.usage.total_tokens != null && {
          totalTokens: response.usage.total_tokens,
        }),
        ...(response.usage.prompt_audio_seconds != null && {
          promptAudioSeconds: response.usage.prompt_audio_seconds,
        }),
        ...(response.usage.request_count != null && {
          requestCount: response.usage.request_count,
        }),
      };
    }

    const providerSegments = response.segments
      ?.filter(
        segment =>
          segment.type != null ||
          segment.score != null ||
          segment.speaker_id != null,
      )
      .map(segment => ({
        text: segment.text,
        startSecond: segment.start,
        endSecond: segment.end,
        ...(segment.type != null && { type: segment.type }),
        ...(segment.score != null && { score: segment.score }),
        ...(segment.speaker_id != null && {
          speakerId: segment.speaker_id,
        }),
      }));

    if (providerSegments != null && providerSegments.length > 0) {
      mistralMetadata.segments = providerSegments;
    }

    return {
      text: response.text,
      segments,
      language: response.language ?? undefined,
      durationInSeconds:
        response.usage?.prompt_audio_seconds ??
        segments.at(-1)?.endSecond ??
        undefined,
      warnings,
      response: {
        timestamp: currentDate,
        modelId: response.model,
        headers: responseHeaders,
        body: rawResponse,
      },
      ...(Object.keys(mistralMetadata).length > 0 && {
        providerMetadata: {
          mistral: mistralMetadata,
        },
      }),
    };
  }
}

function appendFormValue(
  formData: FormData,
  key: string,
  value: string | number | boolean | string[] | undefined,
): void {
  if (value == null) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      formData.append(key, item);
    }
    return;
  }

  formData.append(key, String(value));
}

const mistralTranscriptionResponseSchema = z.object({
  model: z.string(),
  text: z.string(),
  language: z.string().nullish(),
  segments: z
    .array(
      z.object({
        type: z.literal('transcription_segment').nullish(),
        text: z.string(),
        start: z.number(),
        end: z.number(),
        score: z.number().nullish(),
        speaker_id: z.string().nullish(),
      }),
    )
    .nullish(),
  usage: z
    .object({
      prompt_tokens: z.number().nullish(),
      completion_tokens: z.number().nullish(),
      total_tokens: z.number().nullish(),
      prompt_audio_seconds: z.number().nullish(),
      request_count: z.number().nullish(),
    })
    .nullish(),
});
