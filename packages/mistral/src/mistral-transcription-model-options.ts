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
  | 'voxtral-mini-transcribe-realtime-3'
  | 'voxtral-mini-transcribe-realtime-3-0'
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
       * Offline Voxtral 3 requires segment timestamps when diarization is enabled.
       * Realtime diarization cannot be combined with turn detection.
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

      /** Realtime only. Delay in milliseconds: 80–1200, or 2400. */
      targetStreamingDelayMs: z
        .union([z.number().int().min(80).max(1200), z.literal(2400)])
        .optional(),

      /**
       * Realtime only. Named base64-encoded audio clips for known speakers.
       * Requires diarize. Mistral accepts up to 8 clips of 3–15 seconds each.
       */
      speakerReferences: z.record(z.string(), z.string().min(1)).optional(),

      /**
       * Realtime only. Enable turn detection with an empty object for defaults.
       * Turn events are available through includeRawChunks. Mistral validates
       * threshold ordering and compatibility with diarization.
       */
      turnDetection: z
        .object({
          startThreshold: z.number().min(0).max(1).optional(),
          eagerEndThreshold: z.number().min(0).max(1).optional(),
          endThreshold: z.number().min(0).max(1).optional(),
          minSilenceMs: z.number().int().nonnegative().optional(),
          endTimeoutMs: z.number().int().nonnegative().optional(),
        })
        .optional(),
    }),
  ),
);

export type MistralTranscriptionModelOptions = InferSchema<
  typeof mistralTranscriptionModelOptions
>;
