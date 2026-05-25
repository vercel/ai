import { z } from 'zod/v4';
import { GRADIUM_STT_INPUT_FORMATS } from './gradium-api-types';

/**
 * Provider-specific options for `transcribe()` calls against Gradium.
 *
 * Set these via `providerOptions: { gradium: { ... } }`. The AI SDK
 * top-level `mediaType` is mapped automatically. These options expose
 * Gradium-specific knobs that are not in the unified API.
 *
 * @see https://api.gradium.ai/api/post/speech/asr
 */
export const gradiumTranscriptionModelOptionsSchema = z.object({
  /**
   * Override the input format detected from `mediaType`. Pass
   * `"wav"`, `"pcm"`, `"opus"`, or any of the explicit-rate / telephony
   * variants (`"pcm_16000"`, `"ulaw_8000"`, ...).
   */
  inputFormat: z.enum(GRADIUM_STT_INPUT_FORMATS).nullish(),

  /**
   * BCP-47 / ISO 639-1 language hint passed inside `json_config.language`
   * (e.g. `"en"`, `"fr"`). Gradium otherwise auto-detects.
   */
  language: z.string().nullish(),

  /**
   * Raw `json_config` string forwarded verbatim as the `?json_config=`
   * query parameter. Use for advanced knobs like `temp`, `padding_bonus`,
   * or `delay_in_frames`. When set, top-level `language` is ignored.
   */
  jsonConfig: z.string().nullish(),
});

export type GradiumTranscriptionModelOptions = z.infer<
  typeof gradiumTranscriptionModelOptionsSchema
>;

/** @deprecated Renamed to `gradiumTranscriptionModelOptionsSchema`. */
export const gradiumTranscriptionProviderOptionsSchema =
  gradiumTranscriptionModelOptionsSchema;

/** @deprecated Renamed to `GradiumTranscriptionModelOptions`. */
export type GradiumTranscriptionProviderOptions =
  GradiumTranscriptionModelOptions;
