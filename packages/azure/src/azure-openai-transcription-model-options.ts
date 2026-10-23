import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const azureOpenAITranscriptionModelOptionsShape = () => ({
  /**
   * Additional information to include in the transcription response.
   */
  include: z.array(z.string()).optional(),

  /**
   * The language of the input audio in ISO-639-1 format.
   */
  language: z.string().optional(),

  /**
   * An optional text to guide the model's style or continue a previous audio segment.
   */
  prompt: z.string().optional(),

  /**
   * The sampling temperature, between 0 and 1.
   */
  temperature: z.number().min(0).max(1).optional(),

  /**
   * The timestamp granularities to populate for this transcription.
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
   * Options for streaming transcription models such as `gpt-realtime-whisper`.
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

export const azureOpenAITranscriptionModelOptions = lazySchema(() =>
  zodSchema(z.strictObject(azureOpenAITranscriptionModelOptionsShape())),
);

export type AzureTranscriptionModelOpenAIOptions = InferSchema<
  typeof azureOpenAITranscriptionModelOptions
>;
