import { z } from 'zod/v4';

export const speechifySpeechModelOptionsSchema = z.object({
  /**
   * Treat the input text as SSML. When enabled, the input is sent unchanged and
   * the standard `speed` option is ignored (control rate via SSML instead).
   */
  ssml: z.boolean().nullish(),

  /**
   * Speechify codec output format string, e.g. `mp3_24000_128`, `pcm_16000`,
   * `ulaw_8000`. Takes precedence over the standard `outputFormat` option.
   */
  outputFormat: z.string().nullish(),

  /**
   * Normalize the loudness of the generated audio.
   */
  loudnessNormalization: z.boolean().nullish(),

  /**
   * Apply text normalization (e.g. expanding numbers and abbreviations).
   */
  textNormalization: z.boolean().nullish(),
});

export type SpeechifySpeechModelOptions = z.infer<
  typeof speechifySpeechModelOptionsSchema
>;
