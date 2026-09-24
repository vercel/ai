export type FishAudioSpeechFormat = 'wav' | 'pcm' | 'mp3' | 'opus';

export type FishAudioSpeechMp3Bitrate = 64 | 128 | 192;

export type FishAudioSpeechOpusBitrate = -1000 | 24000 | 32000 | 48000 | 64000;

export type FishAudioSpeechLatency = 'low' | 'normal' | 'balanced';

export type FishAudioProsodyControl = {
  /**
   * Speech rate multiplier, 0.5 to 2.0.
   */
  speed?: number;

  /**
   * Volume offset in dB.
   */
  volume?: number;

  /**
   * Loudness normalization. S2-Pro only.
   */
  normalize_loudness?: boolean;
};

/**
 * Request body for `POST /v1/tts`. The model is selected via the `model` HTTP
 * header rather than a body field.
 *
 * Inline `references` (zero-shot voice cloning) are intentionally omitted:
 * they require a MessagePack request body, and this provider sends JSON only.
 * Pre-upload reference audio and pass `reference_id` instead.
 *
 * https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech
 */
export type FishAudioSpeechAPITypes = {
  /**
   * The text to synthesize.
   */
  text: string;

  /**
   * Voice model ID, or an array of IDs for multi-speaker dialogue.
   */
  reference_id?: string | string[];

  /**
   * Speed and volume adjustments.
   */
  prosody?: FishAudioProsodyControl;

  /**
   * Output audio container format.
   */
  format?: FishAudioSpeechFormat;

  /**
   * Output sample rate in Hz. Falls back to the format default when unset.
   */
  sample_rate?: number;

  /**
   * Bitrate in kbps for mp3 output.
   */
  mp3_bitrate?: FishAudioSpeechMp3Bitrate;

  /**
   * Bitrate in bps for opus output. `-1000` selects automatic.
   */
  opus_bitrate?: FishAudioSpeechOpusBitrate;

  /**
   * Latency/quality tradeoff.
   */
  latency?: FishAudioSpeechLatency;

  /**
   * Expressiveness, 0 to 1.
   */
  temperature?: number;

  /**
   * Nucleus sampling, 0 to 1.
   */
  top_p?: number;

  /**
   * Text segment size for processing, 100 to 300.
   */
  chunk_length?: number;

  /**
   * Minimum characters before splitting into a new chunk, 0 to 100.
   */
  min_chunk_length?: number;

  /**
   * Text normalization for English and Chinese.
   */
  normalize?: boolean;

  /**
   * Maximum audio tokens to generate per text chunk.
   */
  max_new_tokens?: number;

  /**
   * Values above 1.0 discourage repeated audio patterns.
   */
  repetition_penalty?: number;

  /**
   * Reuse prior audio as context for voice consistency.
   */
  condition_on_previous_chunks?: boolean;

  /**
   * Early-stop threshold used in batch processing, 0 to 1.
   */
  early_stop_threshold?: number;

  /**
   * Request-scoped backend flags, e.g. `['quality-guard']`.
   */
  features?: string[];
};
