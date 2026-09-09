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
    })
    .optional(),
});

export type CartesiaTranscriptionModelOptions = z.infer<
  typeof cartesiaTranscriptionModelOptionsSchema
>;
