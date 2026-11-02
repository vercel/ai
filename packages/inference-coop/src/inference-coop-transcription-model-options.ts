import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// Catalog: https://gateway.inference.coop/v1/models
export type InferenceCoopTranscriptionModelId =
  | 'tinfoil/whisper-large-v3-turbo'
  | (string & {});

// The gateway accepts the standard Whisper transcription parameters
// (verified against https://gateway.inference.coop/v1/audio/transcriptions,
// 2026-11). `response_format` is not exposed: the gateway ignores it and
// always returns the JSON transcript.
export const inferenceCoopTranscriptionModelOptions = lazySchema(() =>
  zodSchema(
    z.object({
      /**
       * ISO 639-1 language code of the audio, e.g. `en`. Passing it can
       * improve accuracy and speed.
       */
      language: z.string().optional(),

      /**
       * Optional hint to guide the model's style or continue a previous
       * audio segment.
       */
      prompt: z.string().optional(),

      /**
       * Sampling temperature between 0 and 1.
       */
      temperature: z.number().min(0).max(1).optional(),
    }),
  ),
);

export type InferenceCoopTranscriptionModelOptions = InferSchema<
  typeof inferenceCoopTranscriptionModelOptions
>;
