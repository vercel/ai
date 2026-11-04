/**
 * Usage information for a speech translation call.
 *
 * All fields are optional because providers report usage with different
 * granularity (seconds of audio, audio tokens, and/or text tokens).
 */
export type SpeechTranslationModelV4Usage = {
  /**
   * Seconds of input audio that were processed, if reported.
   */
  inputAudioSeconds?: number;

  /**
   * Number of input audio tokens, if reported.
   */
  inputAudioTokens?: number;

  /**
   * Number of output audio tokens, if reported.
   */
  outputAudioTokens?: number;

  /**
   * Number of input text tokens, if reported.
   */
  inputTextTokens?: number;

  /**
   * Number of output text tokens, if reported.
   */
  outputTextTokens?: number;
};
