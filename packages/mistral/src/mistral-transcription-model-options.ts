import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type MistralTranscriptionModelId = 'voxtral-mini-latest' | (string & {});

// https://docs.mistral.ai/api/endpoint/audio/transcriptions
export const mistralTranscriptionModelOptions = lazySchema(() =>
  zodSchema(
    z.object({
      /**
       * The language of the audio, e.g. "en". Providing the language can boost
       * accuracy.
       */
      language: z.string().min(1).optional(),

      /**
       * The sampling temperature.
       */
      temperature: z.number().optional(),

      /**
       * The timestamp granularities to include in the transcription response.
       */
      timestampGranularities: z
        .array(z.enum(['segment', 'word']))
        .min(1)
        .optional(),

      /**
       * Whether to identify speakers in the transcription.
       */
      diarize: z.boolean().optional(),

      /**
       * Words or phrases to guide the model toward correct spellings of names,
       * technical terms, or domain-specific vocabulary.
       *
       * Mistral requires each item to omit commas and whitespace. Use
       * underscores to represent multi-word phrases.
       */
      contextBias: z
        .array(
          z
            .string()
            .min(1)
            .regex(
              /^[^\s,]+$/,
              'Context bias items must not contain commas or whitespace.',
            ),
        )
        .max(100)
        .optional(),
    }),
  ),
);

export type MistralTranscriptionModelOptions = InferSchema<
  typeof mistralTranscriptionModelOptions
>;
