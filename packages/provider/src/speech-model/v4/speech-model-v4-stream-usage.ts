import type { JSONObject } from '../../json-value/json-value';

/**
 * Usage information for a speech stream call.
 *
 * All fields are optional because providers bill speech with different
 * units (input characters, text tokens, and/or audio tokens).
 */
export type SpeechModelV4StreamUsage = {
  /**
   * Number of input text characters (Unicode code points) that were sent
   * for synthesis, if known. Character-billed providers report this.
   */
  inputCharacters?: number;

  /**
   * Number of input text tokens, if reported.
   */
  inputTokens?: number;

  /**
   * Number of output audio tokens, if reported.
   */
  outputTokens?: number;

  /**
   * Raw usage information from the provider, in the shape the provider
   * returns it.
   */
  raw?: JSONObject;
};
