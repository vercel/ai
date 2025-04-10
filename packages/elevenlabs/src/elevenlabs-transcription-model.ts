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
import {
  ElevenLabsTranscriptionModelId,
  ElevenLabsTranscriptionModelOptions,
} from './elevenlabs-transcription-settings';

// https://elevenlabs.io/docs/api-reference/speech-to-text/convert
const ElevenLabsProviderOptionsSchema = z.object({
  languageCode: z
    .string()
    .optional(),
  tagAudioEvents: z
    .boolean()
    .optional()
    .default(true),
  numSpeakers: z
    .number()
    .int()
    .min(1)
    .max(32)
    .optional(),
  timestampsGranularity: z
    .enum(['none', 'word', 'character'])
    .optional()
    .default('word'),
  diarize: z
    .boolean()
    .optional()
    .default(false),
  additionalFormats: z
    .array(
      z.union([
        z.object({
          format: z.literal('docx'),
          include_speakers: z.boolean().optional(),
          include_timestamps: z.boolean().optional(),
          max_segment_chars: z.number().optional(),
          max_segment_duration_s: z.number().optional(),
          segment_on_silence_longer_than_s: z.number().optional(),
        }),
        z.object({
          format: z.literal('html'),
          include_speakers: z.boolean().optional(),
          include_timestamps: z.boolean().optional(),
          max_segment_chars: z.number().optional(),
          max_segment_duration_s: z.number().optional(),
          segment_on_silence_longer_than_s: z.number().optional(),
        }),
        z.object({
          format: z.literal('pdf'),
          include_speakers: z.boolean().optional(),
          include_timestamps: z.boolean().optional(),
          max_segment_chars: z.number().optional(),
          max_segment_duration_s: z.number().optional(),
          segment_on_silence_longer_than_s: z.number().optional(),
        }),
        z.object({
          format: z.literal('segmented_json'),
          max_segment_chars: z.number().optional(),
          max_segment_duration_s: z.number().optional(),
          segment_on_silence_longer_than_s: z.number().optional(),
        }),
        z.object({
          format: z.literal('srt'),
          include_speakers: z.boolean().optional(),
          include_timestamps: z.boolean().optional(),
          max_characters_per_line: z.number().optional(),
          max_segment_chars: z.number().optional(),
          max_segment_duration_s: z.number().optional(),
          segment_on_silence_longer_than_s: z.number().optional(),
        }),
        z.object({
          format: z.literal('txt'),
          include_speakers: z.boolean().optional(),
          include_timestamps: z.boolean().optional(),
          max_characters_per_line: z.number().optional(),
          max_segment_chars: z.number().optional(),
          max_segment_duration_s: z.number().optional(),
          segment_on_silence_longer_than_s: z.number().optional(),
        }),
      ]),
    )
    .optional(),
  file_format: z
    .enum(['pcm_s16le_16', 'other'])
    .optional()
    .default('other'),
});

export type ElevenLabsTranscriptionCallOptions = Omit<
  TranscriptionModelV1CallOptions,
  'providerOptions'
> & {
  providerOptions?: {
    elevenlabs?: z.infer<typeof ElevenLabsProviderOptionsSchema>;
  };
};

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
  }: ElevenLabsTranscriptionCallOptions) {
    const warnings: TranscriptionModelV1CallWarning[] = [];

    // Parse provider options
    const elevenlabsOptions = parseProviderOptions({
      provider: 'elevenlabs',
      providerOptions,
      schema: ElevenLabsProviderOptionsSchema,
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
      const transcriptionModelOptions: ElevenLabsTranscriptionModelOptions = {
        language_code: elevenlabsOptions.languageCode,
        tag_audio_events: elevenlabsOptions.tagAudioEvents,
        num_speakers: elevenlabsOptions.numSpeakers,
        timestamps_granularity: elevenlabsOptions.timestampsGranularity,
        diarize: elevenlabsOptions.diarize,
        additional_formats: elevenlabsOptions.additionalFormats,
        file_format: elevenlabsOptions.file_format,
      };

      for (const key in transcriptionModelOptions) {
        const value =
          transcriptionModelOptions[
            key as keyof ElevenLabsTranscriptionModelOptions
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
    options: ElevenLabsTranscriptionCallOptions,
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
        type: z
          .enum(['word', 'spacing', 'audio_event']),
        start: z
          .number()
          .optional(),
        end: z
          .number()
          .optional(),
        speaker_id: z
          .string()
          .optional(),
        characters: z
          .array(
            z.object({
              text: z.string(),
              start: z
                .number()
                .optional(),
              end: z
                .number()
                .optional()
            }),
          )
          .optional(),
      }),
    )
    .optional(),
  additional_formats: z
    .array(
      z.object({
        requested_format: z.string(),
        file_extension: z
          .string(),
        content_type: z.string(),
        is_base64_encoded: z
          .boolean(),
        content: z.string(),
      }),
    )
    .optional(),
});
