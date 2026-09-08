import { z } from 'zod/v4';

/**
 * Nebul transcription model ids from the Nebul Model Catalog,
 * https://docs.nebul.io/docs/inference-api/models/speech-to-text
 * retrieved on 2026-09-08.
 */
export type NebulTranscriptionModelId = string & {};

export const nebulTranscriptionModelOptions = z.object({
  /**
   * The format of the transcript output.
   */
  responseFormat: z
    .enum(['json', 'text', 'srt', 'verbose_json', 'vtt'])
    .optional(),

  /**
   * The language of the input audio as an ISO-639-1 code
   * (e.g. 'en' for English). Supplying it usually improves
   * accuracy and latency.
   */
  language: z.string().optional(),

  /**
   * Optional text to guide the model's style or continue a
   * previous audio segment.
   */
  prompt: z.string().optional(),

  /**
   * The sampling temperature, between 0 and 1. Higher values
   * make the output more random.
   */
  temperature: z.number().optional(),
});

export type NebulTranscriptionModelOptions = z.infer<
  typeof nebulTranscriptionModelOptions
>;
