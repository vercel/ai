import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type MistralTranscriptionModelId =
  | 'voxtral-mini-2602'
  | 'voxtral-mini-latest'
  | 'voxtral-mini-transcribe-3-0'
  | 'voxtral-mini-transcribe-3'
  | 'voxtral-mini-transcribe-latest'
  | 'voxtral-small-transcribe-3-0'
  | 'voxtral-small-transcribe-3'
  | 'voxtral-small-transcribe-latest'
  | (string & {});

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
       * Return the detected language. Cannot be combined with `language`.
       */
      returnLanguage: z.boolean().optional(),

      /**
       * The sampling temperature.
       */
      temperature: z.number().optional(),

      /**
       * The timestamp granularities to include in the transcription response.
       * Voxtral 3 supports segment timestamps only.
       */
      timestampGranularities: z
        .array(z.enum(['segment', 'word']))
        .min(1)
        .optional(),

      /**
       * Whether to identify speakers in the transcription.
       * Voxtral 3 requires segment timestamps when diarization is enabled.
       */
      diarize: z.boolean().optional(),

      /**
       * Words or phrases to guide the model toward correct spellings of names,
       * technical terms, or domain-specific vocabulary.
       *
       * Voxtral 3 also accepts phrases and descriptions of the recording,
       * including spaces and punctuation. Entries share the context window
       * with the audio.
       */
      contextBias: z.array(z.string().min(1)).optional(),
    }),
  ),
);

export type MistralTranscriptionModelOptions = InferSchema<
  typeof mistralTranscriptionModelOptions
>;
