import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type OpenAITranscriptionModelId =
  | 'whisper-1'
  | 'gpt-4o-mini-transcribe'
  | 'gpt-4o-mini-transcribe-2025-03-20'
  | 'gpt-4o-mini-transcribe-2025-12-15'
  | 'gpt-4o-transcribe'
  | 'gpt-4o-transcribe-diarize'
  | 'gpt-live-transcribe'
  | 'gpt-realtime-whisper'
  | 'gpt-transcribe'
  | (string & {});

// https://platform.openai.com/docs/api-reference/audio/createTranscription
/**
 * Shape of the OpenAI transcription model options. Exported so that routers
 * that also call the OpenAI transcription API (e.g. Azure) can accept these
 * options under their own providerOptions key.
 */
export const openAITranscriptionModelOptionsShape = () => ({
  /**
   * Additional information to include in the transcription response.
   */

  include: z.array(z.string()).optional(),

  /**
   * The language of the input audio in ISO-639-1 format.
   */
  language: z.string().optional(),

  /**
   * Expected languages, e.g. with gpt-transcribe or gpt-live-transcribe.
   * Use this instead of language. The API validates model support.
   */
  languages: z.array(z.string()).optional(),

  /**
   * Vocabulary hints, e.g. names, acronyms or technical terms. Hints, not
   * required output. Each keyword must stay on one line and cannot contain
   * `<`, `>`, a carriage return or a line feed. The API validates model
   * support.
   */
  keywords: z.array(z.string()).optional(),

  /**
   * Free-form context about the recording — its topic or setting — which also
   * guides style and can continue a previous audio segment. Supported by both
   * the REST and realtime transcription surfaces; the API rejects a prompt
   * past the model's length limit.
   */
  prompt: z.string().optional(),

  /**
   * The sampling temperature, between 0 and 1.
   * @default 0
   */
  temperature: z.number().min(0).max(1).default(0).optional(),

  /**
   * The timestamp granularities to populate for this transcription.
   * Defaults to ['segment'] when the response format is verbose_json.
   */
  timestampGranularities: z.array(z.enum(['word', 'segment'])).optional(),

  /**
   * The format of the transcription response.
   */
  responseFormat: z.enum(['json', 'verbose_json', 'diarized_json']).optional(),

  /**
   * Controls how the audio is split into chunks before transcription.
   */
  chunkingStrategy: z
    .union([
      z.literal('auto'),
      z.object({
        type: z.literal('server_vad'),
        threshold: z.number().min(0).max(1).optional(),
        prefixPaddingMs: z.number().int().min(0).optional(),
        silenceDurationMs: z.number().int().min(0).optional(),
      }),
    ])
    .optional(),

  /**
   * Options for streaming transcription models such as `gpt-live-transcribe`.
   */
  streaming: z
    .object({
      /**
       * Latency/accuracy tradeoff for realtime transcription.
       */
      delay: z.enum(['minimal', 'low', 'medium', 'high', 'xhigh']).optional(),

      /**
       * Additional fields to include in realtime transcription events.
       */
      include: z.array(z.string()).optional(),
    })
    .optional(),
});

export const openAITranscriptionModelOptions = lazySchema(() =>
  zodSchema(z.object(openAITranscriptionModelOptionsShape())),
);

export type OpenAITranscriptionModelOptions = InferSchema<
  typeof openAITranscriptionModelOptions
>;
