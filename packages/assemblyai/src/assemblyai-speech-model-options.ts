import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// https://www.assemblyai.com/docs/tts/api-reference/http-api/create-speech
export const assemblyaiSpeechModelOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      /**
       * Audio encoding of the output. Overrides the encoding derived from
       * `outputFormat`.
       */
      encoding: z
        .enum(['pcm_s16le', 'pcm_mulaw', 'pcm_alaw', 'mp3'])
        .optional(),
      /**
       * `raw` returns the encoded samples alone; `wav` wraps them in a WAV file.
       * Requires a `pcm_*` encoding.
       */
      container: z.enum(['raw', 'wav']).optional(),
      /**
       * Sample rate of the output audio in Hz.
       */
      sampleRate: z
        .union([
          z.literal(8000),
          z.literal(16000),
          z.literal(22050),
          z.literal(24000),
          z.literal(44100),
          z.literal(48000),
        ])
        .optional(),
      /**
       * MP3 bit rate in bits per second. MP3 output only.
       */
      bitRate: z
        .union([
          z.literal(32000),
          z.literal(48000),
          z.literal(64000),
          z.literal(96000),
          z.literal(128000),
        ])
        .optional(),
    }),
  ),
);

export type AssemblyAISpeechModelOptions = InferSchema<
  typeof assemblyaiSpeechModelOptionsSchema
>;
