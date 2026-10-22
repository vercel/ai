import type { SharedV4ProviderOptions } from '../../shared/v4/shared-v4-provider-options';

/**
 * One piece of streamed input text. Consecutive parts are synthesized in
 * order as one continuous script.
 */
export type SpeechModelV4StreamTextPart = {
  type: 'text';

  /**
   * The text to synthesize. Parts may split anywhere, including mid-word.
   */
  text: string;

  /**
   * The voice that speaks this part. Like the call's `voice`, the value is
   * provider-specific (a voice ID, name, or other identifier). Defaults to the
   * call's `voice`. Providers that support several voices per stream (e.g.
   * dialogue) switch speakers when it changes; single-voice providers reject a
   * part whose voice differs from the call's voice.
   */
  voice?: string;

  /**
   * Additional provider-specific options for this part, keyed by provider
   * name (e.g. to start a new speaker turn without changing the voice).
   */
  providerOptions?: SharedV4ProviderOptions;
};
