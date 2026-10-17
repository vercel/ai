import { z } from 'zod/v4';

/** Raw audio encodings accepted by Ink 2 streaming transcription. */
export const cartesiaStreamingEncodingSchema = z.enum([
  'pcm_alaw',
  'pcm_f16le',
  'pcm_f32le',
  'pcm_mulaw',
  'pcm_s16le',
  'pcm_s32le',
]);

// https://docs.cartesia.ai/api-reference/stt/transcribe
export const cartesiaTranscriptionModelOptionsSchema = z.object({
  /** The language of the audio (ISO 639-1 code). Defaults to English. */
  language: z.string().nullish(),
  /** The timestamp granularities to populate. Currently only `word` is supported. */
  timestampGranularities: z.array(z.enum(['word'])).nullish(),
  /** Options for realtime Ink 2 transcription over WebSocket. */
  streaming: z
    .object({
      /**
       * Raw audio encoding sent to Ink 2. Defaults to the encoding inferred
       * from `inputAudioFormat.type`.
       */
      encoding: cartesiaStreamingEncodingSchema.optional(),
      /**
       * Use Cartesia's native turn detection endpoint. Defaults to true.
       * Disable this to finalize the transcript only when the audio stream ends.
       */
      turnDetection: z.boolean().optional(),
      /**
       * Words or phrases the model should favor, such as product names or
       * jargon. Up to 100 terms and 1200 characters in total.
       */
      keyterms: z.array(z.string()).max(100).optional(),
      /**
       * Turn detection: the turn starts when the likelihood that the user is
       * speaking rises above this value. Ignored when `turnDetection` is
       * false.
       */
      turnStartThreshold: z.number().optional(),
      /**
       * Turn detection: an early end of turn is signaled when the likelihood
       * that the user is speaking falls below this value. Ignored when
       * `turnDetection` is false.
       */
      turnEagerEndThreshold: z.number().optional(),
      /**
       * Turn detection: the turn ends when the likelihood that the user is
       * speaking falls below this value. Ignored when `turnDetection` is
       * false.
       */
      turnEndThreshold: z.number().optional(),
      /**
       * Turn detection: the longest time in milliseconds to wait after the user
       * stops speaking before the turn ends. Ignored when `turnDetection` is
       * false.
       */
      turnEndTimeoutMs: z.number().int().optional(),
    })
    .optional(),
});

export type CartesiaTranscriptionModelOptions = z.infer<
  typeof cartesiaTranscriptionModelOptionsSchema
>;
