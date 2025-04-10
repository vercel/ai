import {
  TranscriptionModelV1,
  TranscriptionModelV1CallOptions,
  TranscriptionModelV1CallWarning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  parseProviderOptions,
  postFormDataToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { ElevenLabsConfig } from './elevenlabs-config';
import { elevenlabsFailedResponseHandler } from './elevenlabs-error';
import { ElevenLabsTranscriptionModelId } from './elevenlabs-transcription-settings';
import { ElevenLabsTranscriptionAPITypes } from './elevenlabs-api-types';

// https://elevenlabs.io/docs/api-reference/speech-to-text/convert
const elevenLabsProviderOptionsSchema = z.object({
  languageCode: z.string().nullish(),
  tagAudioEvents: z.boolean().nullish().default(true),
  numSpeakers: z.number().int().min(1).max(32).nullish(),
  timestampsGranularity: z
    .enum(['none', 'word', 'character'])
    .nullish()
    .default('word'),
  diarize: z.boolean().nullish().default(false),
  additionalFormats: z
    .array(
      z.union([
        z.object({
          format: z.literal('docx'),
          include_speakers: z.boolean().nullish(),
          include_timestamps: z.boolean().nullish(),
          max_segment_chars: z.number().nullish(),
          max_segment_duration_s: z.number().nullish(),
          segment_on_silence_longer_than_s: z.number().nullish(),
        }),
        z.object({
          format: z.literal('html'),
          include_speakers: z.boolean().nullish(),
          include_timestamps: z.boolean().nullish(),
          max_segment_chars: z.number().nullish(),
          max_segment_duration_s: z.number().nullish(),
          segment_on_silence_longer_than_s: z.number().nullish(),
        }),
        z.object({
          format: z.literal('pdf'),
          include_speakers: z.boolean().nullish(),
          include_timestamps: z.boolean().nullish(),
          max_segment_chars: z.number().nullish(),
          max_segment_duration_s: z.number().nullish(),
          segment_on_silence_longer_than_s: z.number().nullish(),
        }),
        z.object({
          format: z.literal('segmented_json'),
          max_segment_chars: z.number().nullish(),
          max_segment_duration_s: z.number().nullish(),
          segment_on_silence_longer_than_s: z.number().nullish(),
        }),
        z.object({
          format: z.literal('srt'),
          include_speakers: z.boolean().nullish(),
          include_timestamps: z.boolean().nullish(),
          max_characters_per_line: z.number().nullish(),
          max_segment_chars: z.number().nullish(),
          max_segment_duration_s: z.number().nullish(),
          segment_on_silence_longer_than_s: z.number().nullish(),
        }),
        z.object({
          format: z.literal('txt'),
          include_speakers: z.boolean().nullish(),
          include_timestamps: z.boolean().nullish(),
          max_characters_per_line: z.number().nullish(),
          max_segment_chars: z.number().nullish(),
          max_segment_duration_s: z.number().nullish(),
          segment_on_silence_longer_than_s: z.number().nullish(),
        }),
      ]),
    )
    .nullish(),
  file_format: z.enum(['pcm_s16le_16', 'other']).nullish().default('other'),
});

export type ElevenLabsTranscriptionCallOptions = z.infer<
  typeof elevenLabsProviderOptionsSchema
>;

interface ElevenLabsTranscriptionModelConfig extends ElevenLabsConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class ElevenLabsTranscriptionModel implements TranscriptionModelV1 {
  readonly specificationVersion = 'v1';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: ElevenLabsTranscriptionModelId,
    private readonly config: ElevenLabsTranscriptionModelConfig,
  ) {}

  private getArgs({
    audio,
    mediaType,
    providerOptions,
  }: Parameters<TranscriptionModelV1['doGenerate']>[0]) {
    const warnings: TranscriptionModelV1CallWarning[] = [];

    // Parse provider options
    const elevenlabsOptions = parseProviderOptions({
      provider: 'elevenlabs',
      providerOptions,
      schema: elevenLabsProviderOptionsSchema,
    });

    // Create form data with base fields
    const formData = new FormData();
    const blob =
      audio instanceof Uint8Array
        ? new Blob([audio])
        : new Blob([convertBase64ToUint8Array(audio)]);

    formData.append('model_id', this.modelId);
    formData.append('file', new File([blob], 'audio', { type: mediaType }));

    // Add provider-specific options
    if (elevenlabsOptions) {
      const transcriptionModelOptions: ElevenLabsTranscriptionAPITypes = {
        language_code: elevenlabsOptions.languageCode ?? undefined,
        tag_audio_events: elevenlabsOptions.tagAudioEvents ?? undefined,
        num_speakers: elevenlabsOptions.numSpeakers ?? undefined,
        timestamps_granularity:
          elevenlabsOptions.timestampsGranularity ?? undefined,
        diarize: elevenlabsOptions.diarize ?? undefined,
        additional_formats: elevenlabsOptions.additionalFormats?.map(format => {
          const result: any = { format: format.format };

          if ('include_speakers' in format)
            result.include_speakers = format.include_speakers ?? undefined;
          if ('include_timestamps' in format)
            result.include_timestamps = format.include_timestamps ?? undefined;
          if ('max_segment_chars' in format)
            result.max_segment_chars = format.max_segment_chars ?? undefined;
          if ('max_segment_duration_s' in format)
            result.max_segment_duration_s =
              format.max_segment_duration_s ?? undefined;
          if ('segment_on_silence_longer_than_s' in format)
            result.segment_on_silence_longer_than_s =
              format.segment_on_silence_longer_than_s ?? undefined;
          if ('max_characters_per_line' in format)
            result.max_characters_per_line =
              format.max_characters_per_line ?? undefined;

          return result;
        }),
        file_format: elevenlabsOptions.file_format ?? undefined,
      };

      for (const key in transcriptionModelOptions) {
        const value =
          transcriptionModelOptions[
            key as keyof ElevenLabsTranscriptionAPITypes
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
    options: Parameters<TranscriptionModelV1['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV1['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { formData, warnings } = this.getArgs(options);

    const {
      value: response,
      responseHeaders,
      rawValue: rawResponse,
    } = await postFormDataToApi({
      url: this.config.url({
        path: '/v1/speech-to-text',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      formData,
      failedResponseHandler: elevenlabsFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        elevenlabsTranscriptionResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return {
      text: response.text,
      segments:
        response.words?.map(word => ({
          text: word.text,
          startSecond: word.start ?? 0,
          endSecond: word.end ?? 0,
        })) ?? [],
      language: response.language_code,
      durationInSeconds: response.words?.at(-1)?.end ?? undefined,
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

const elevenlabsTranscriptionResponseSchema = z.object({
  language_code: z.string(),
  language_probability: z.number(),
  text: z.string(),
  words: z
    .array(
      z.object({
        text: z.string(),
        type: z.enum(['word', 'spacing', 'audio_event']),
        start: z.number().nullish(),
        end: z.number().nullish(),
        speaker_id: z.string().nullish(),
        characters: z
          .array(
            z.object({
              text: z.string(),
              start: z.number().nullish(),
              end: z.number().nullish(),
            }),
          )
          .nullish(),
      }),
    )
    .nullish(),
  additional_formats: z
    .array(
      z.object({
        requested_format: z.string(),
        file_extension: z.string(),
        content_type: z.string(),
        is_base64_encoded: z.boolean(),
        content: z.string(),
      }),
    )
    .nullish(),
});
