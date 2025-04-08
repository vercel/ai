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

// https://platform.openai.com/docs/api-reference/audio/createTranscription
const ElevenLabsProviderOptionsSchema = z.object({
  languageCode: z
    .string()
    .optional()
    .describe(
      'An ISO-639-1 or ISO-639-3 language_code corresponding to the language of the audio file. Can sometimes improve transcription performance if known beforehand. Defaults to null, in this case the language is predicted automatically.',
    ),
  tagAudioEvents: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether to tag audio events like (laughter), (footsteps), etc. in the transcription.'),
  numSpeakers: z
    .number()
    .int()
    .min(1)
    .max(32)
    .optional()
    .describe(
      'The maximum amount of speakers talking in the uploaded file. Can help with predicting who speaks when. The maximum amount of speakers that can be predicted is 32. Defaults to null, in this case the amount of speakers is set to the maximum value the model supports.',
    ),
  timestampsGranularity: z
    .enum(['none', 'word', 'character'])
    .optional()
    .default('word')
    .describe(
      "The granularity of the timestamps in the transcription. 'word' provides word-level timestamps and 'character' provides character-level timestamps per word.",
    ),
  diarize: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether to annotate which speaker is currently talking in the uploaded file.'),
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
    .optional()
    .describe('A list of additional formats to export the transcript to.'),
  file_format: z
    .enum(['pcm_s16le_16', 'other'])
    .optional()
    .default('other')
    .describe(
      'The format of input audio. For pcm_s16le_16, the input audio must be 16-bit PCM at a 16kHz sample rate, single channel (mono), and little-endian byte order. Latency will be lower than with passing an encoded waveform.',
    ),
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

    formData.append('model', this.modelId);
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
          formData.append(key, value as string);
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
  language_code: z.string().describe("The detected language code (e.g. 'eng' for English)."),
  language_probability: z.number().describe("The confidence score of the language detection (0 to 1)."),
  text: z.string().describe("The raw text of the transcription."),
  words: z
    .array(
      z.object({
        text: z.string().describe("The word or sound that was transcribed."),
        type: z.enum(["word", "spacing", "audio_event"]).describe("The type of the word or sound. 'audio_event' is used for non-word sounds like laughter or footsteps."),
        start: z.number().optional().describe("The start time of the word or sound in seconds."),
        end: z.number().optional().describe("The end time of the word or sound in seconds."),
        speaker_id: z.string().optional().describe("Unique identifier for the speaker of this word."),
        characters: z
          .array(
            z.object({
              text: z.string().describe("The character that was transcribed."),
              start: z.number().optional().describe("The start time of the character in seconds."),
              end: z.number().optional().describe("The end time of the character in seconds."),
            })
          )
          .optional()
          .describe("The characters that make up the word and their timing information."),
      })
    )
    .optional()
    .describe("List of words with their timing information."),
  additional_formats: z
    .array(
      z.object({
        requested_format: z.string().describe("The requested format."),
        file_extension: z.string().describe("The file extension of the additional format."),
        content_type: z.string().describe("The content type of the additional format."),
        is_base64_encoded: z.boolean().describe("Whether the content is base64 encoded."),
        content: z.string().describe("The content of the additional format."),
      })
    )
    .optional()
    .describe("Optional requested additional formats of the transcript."),
});
