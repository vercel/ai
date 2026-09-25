import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const azureSpeechTranscriptionModelOptionsShape = () => ({
  /**
   * Timing granularity. Defaults to `segment` so that transcription results
   * include timed segments (Azure's own default is `none`).
   */
  timestamps: z.enum(['word', 'segment', 'none']).optional(),

  /**
   * `verbatim` keeps fillers and false starts, `clean` removes them.
   * Azure defaults to `verbatim`.
   */
  transcribeStyle: z.enum(['verbatim', 'clean']).optional(),

  /**
   * Forces a single language, e.g. `['en']`. Omit for automatic language
   * detection and code switching.
   */
  locales: z.array(z.string()).length(1).optional(),

  /**
   * Speaker diarization. Speaker IDs are available in provider metadata.
   */
  diarization: z.object({ enabled: z.boolean() }).optional(),

  /**
   * Keyword biasing for names and domain terminology.
   */
  phraseList: z.object({ phrases: z.array(z.string()) }).optional(),
});

export const azureSpeechTranscriptionModelOptions = lazySchema(() =>
  zodSchema(z.object(azureSpeechTranscriptionModelOptionsShape())),
);

export type AzureTranscriptionModelSpeechOptions = InferSchema<
  typeof azureSpeechTranscriptionModelOptions
>;
