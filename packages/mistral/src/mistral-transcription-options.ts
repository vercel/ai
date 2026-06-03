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
       * The language of the audio, e.g. "en". Providing the language can boost accuracy.
       */
      language: z.string().optional(),

      /**
       * The sampling temperature.
       */
      temperature: z.number().optional(),

      /**
       * The timestamp granularities to include in the transcription response.
       */
      timestamp_granularities: z.array(z.enum(['word', 'segment'])).optional(),

      /**
       * Whether to identify speakers in the transcription.
       */
      diarize: z.boolean().optional(),

      /**
       * Words or phrases to guide the model toward correct spellings of names,
       * technical terms, or domain-specific vocabulary.
       */
      contextBias: z.array(z.string()).optional(),
    }),
  ),
);

export type MistralTranscriptionModelOptions = InferSchema<
  typeof mistralTranscriptionModelOptions
>;
