import { z } from 'zod/v4';

// https://docs.fish.audio/api-reference/endpoint/openapi-v1/speech-to-text
export const fishAudioTranscriptionModelOptionsSchema = z.object({
  /**
   * Language of the audio.
   *
   * A hint only. Fish Audio passes it to the model, but auto-detection is
   * authoritative and overrides it, so this changes neither the transcript nor
   * the reported language. The detected language is reported as
   * `result.language`.
   */
  language: z.string().optional(),

  /**
   * Whether to skip precise timestamps. Mirrors the Fish Audio
   * `ignore_timestamps` parameter, whose API default is `true`.
   *
   * This provider defaults it to `false` so that `result.segments` is
   * populated. Fish Audio documents an added latency cost for audio shorter
   * than 30 seconds; set this to `true` to trade segments for that latency.
   */
  ignoreTimestamps: z.boolean().optional(),
});

export type FishAudioTranscriptionModelOptions = z.infer<
  typeof fishAudioTranscriptionModelOptionsSchema
>;
