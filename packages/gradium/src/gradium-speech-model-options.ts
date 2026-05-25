import { z } from 'zod/v4';
import { GRADIUM_TTS_OUTPUT_FORMATS } from './gradium-api-types';

/**
 * Provider-specific options for `generateSpeech()` calls against Gradium.
 *
 * Set these via `providerOptions: { gradium: { ... } }`. AI SDK top-level
 * `voice`, `outputFormat`, `language`, and `speed` are auto-mapped. These
 * options are for overrides and Gradium-specific knobs.
 *
 * @see https://api.gradium.ai/api/post/speech/tts
 */
export const gradiumSpeechModelOptionsSchema = z.object({
  /**
   * Override the voice ID. Takes precedence over the AI SDK top-level
   * `voice` argument. Accepts any Gradium library voice ID
   * (e.g. `"YTpq7expH9539ERJ"`) or a custom voice clone ID.
   */
  voiceId: z.string().nullish(),

  /**
   * Override the output format. Takes precedence over the AI SDK
   * top-level `outputFormat` argument. Use this to access telephony
   * (`ulaw_8000`, `mulaw_8000`, `alaw_8000`) and explicit-rate PCM
   * (`pcm_8000`, `pcm_16000`, ..., `pcm_48000`) variants.
   */
  outputFormat: z.enum(GRADIUM_TTS_OUTPUT_FORMATS).nullish(),

  /**
   * Raw `json_config` string forwarded verbatim. Use when Gradium exposes
   * a new option before this provider has a typed convenience field. When
   * set, top-level `speed`, `language`, and structured Gradium settings are
   * ignored to avoid conflicts.
   */
  jsonConfig: z.string().nullish(),

  /**
   * Extra pause duration between spoken chunks. Lower values, including
   * negative values, make speech feel faster; higher values add spacing.
   * Takes precedence over the AI SDK top-level `speed` mapping.
   */
  paddingBonus: z.number().min(-4).max(4).nullish(),

  /**
   * Voice-similarity coefficient (1.0-4.0). Higher values track the
   * cloned voice more closely; default is 2.0. Synthesised into
   * `json_config` when `jsonConfig` is not set explicitly.
   */
  cfgCoef: z.number().min(1).max(4).nullish(),

  /** Sampling temperature for generation. */
  temperature: z.number().min(0).max(2).nullish(),

  /**
   * Text-rewrite rules applied before synthesis. Stored in `json_config`.
   * Pass a language code (`"en"`, `"fr"`, `"de"`, `"es"`, `"pt"`) to
   * enable the recommended rules for that language, or a comma-separated
   * list of explicit rule names.
   */
  rewriteRules: z.string().nullish(),

  /** Pronunciation dictionary ID to apply during synthesis. */
  pronunciationDictionary: z.string().nullish(),

  /**
   * If true (default), the response body is the raw audio stream. If
   * false, the response is JSON containing timing metadata and base64
   * audio chunks. Audio extraction is handled inside the provider when
   * this is `false`.
   */
  onlyAudio: z.boolean().nullish(),
});

export type GradiumSpeechModelOptions = z.infer<
  typeof gradiumSpeechModelOptionsSchema
>;

/** @deprecated Renamed to `gradiumSpeechModelOptionsSchema`. */
export const gradiumSpeechProviderOptionsSchema =
  gradiumSpeechModelOptionsSchema;

/** @deprecated Renamed to `GradiumSpeechModelOptions`. */
export type GradiumSpeechProviderOptions = GradiumSpeechModelOptions;

/** @deprecated Renamed to `gradiumSpeechModelOptionsSchema`. */
export const gradiumProviderOptionsSchema = gradiumSpeechModelOptionsSchema;

/** @deprecated Renamed to `GradiumSpeechModelOptions`. */
export type GradiumProviderOptions = GradiumSpeechModelOptions;
