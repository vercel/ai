import { z } from 'zod/v4';

// https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech
export const fishAudioSpeechModelOptionsSchema = z.object({
  /**
   * Voice model ID(s). A single ID selects one speaker; an array enables
   * multi-speaker dialogue (S2-Pro models), in which case the text must mark
   * turns with speaker tokens such as `<|speaker:0|>`. The speaker index maps
   * to the position in this array.
   *
   * Takes precedence over the top-level `voice` option.
   */
  referenceId: z.union([z.string(), z.array(z.string())]).optional(),

  /**
   * Output sample rate in Hz. Falls back to the format default when unset
   * (44100 Hz for wav/pcm/mp3, 48000 Hz for opus).
   */
  sampleRate: z.number().int().positive().optional(),

  /**
   * Bitrate in kbps for mp3 output. Ignored for other formats.
   */
  mp3Bitrate: z
    .union([z.literal(64), z.literal(128), z.literal(192)])
    .optional(),

  /**
   * Bitrate in bps for opus output, where `-1000` selects automatic. Ignored
   * for other formats.
   */
  opusBitrate: z
    .union([
      z.literal(-1000),
      z.literal(24_000),
      z.literal(32_000),
      z.literal(48_000),
      z.literal(64_000),
    ])
    .optional(),

  /**
   * Latency/quality tradeoff. `normal` gives the best quality, `balanced`
   * reduces latency, and `low` is the fastest.
   */
  latency: z.enum(['low', 'normal', 'balanced']).optional(),

  /**
   * Volume offset in dB. Negative values are quieter.
   */
  volume: z.number().optional(),

  /**
   * Loudness normalization. Supported by the S2 family (`s2-pro` and
   * `s2.1-pro`). Fish Audio accepts it on `s1` but ignores it, so the provider
   * emits a warning in that case.
   */
  normalizeLoudness: z.boolean().optional(),

  /**
   * Governs expressiveness. Higher values are more varied, lower values more
   * consistent.
   */
  temperature: z.number().min(0).max(1).optional(),

  /**
   * Controls diversity via nucleus sampling.
   */
  topP: z.number().min(0).max(1).optional(),

  /**
   * Text segment size for processing.
   */
  chunkLength: z.number().int().min(100).max(300).optional(),

  /**
   * Minimum characters before splitting into a new chunk.
   */
  minChunkLength: z.number().int().min(0).max(100).optional(),

  /**
   * Text normalization for English and Chinese. Helps stability with numbers.
   */
  normalize: z.boolean().optional(),

  /**
   * Maximum audio tokens to generate per text chunk.
   */
  maxNewTokens: z.number().int().positive().optional(),

  /**
   * Values above 1.0 discourage repeated audio patterns.
   */
  repetitionPenalty: z.number().optional(),

  /**
   * Reuse prior audio as context for voice consistency across chunks.
   */
  conditionOnPreviousChunks: z.boolean().optional(),

  /**
   * Early-stop threshold used in batch processing.
   */
  earlyStopThreshold: z.number().min(0).max(1).optional(),

  /**
   * Request-scoped flags passed through to the inference backend, e.g.
   * `['quality-guard']`.
   */
  features: z.array(z.string()).optional(),
});

export type FishAudioSpeechModelOptions = z.infer<
  typeof fishAudioSpeechModelOptionsSchema
>;
