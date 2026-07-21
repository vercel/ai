/**
 * Normalized realtime token usage, reported on terminal events
 * (`response-done` and `input-transcription-completed`).
 *
 * Counts are the provider's raw counts: the input buckets INCLUDE any cached
 * tokens, and the cached portions are reported separately in
 * `cachedInput*Tokens`. This mirrors how providers report realtime usage on the
 * wire and lets a consumer apply its own cached-vs-uncached billing split
 * without re-parsing the event's `raw` payload.
 *
 * Every field is optional: providers only populate what they actually report,
 * and the whole `usage` object is omitted when nothing is observable.
 */
export type RealtimeModelV4Usage = {
  /**
   * Input text tokens (includes any cached text tokens).
   */
  inputTextTokens?: number;

  /**
   * Input audio tokens (includes any cached audio tokens).
   */
  inputAudioTokens?: number;

  /**
   * Output text tokens.
   */
  outputTextTokens?: number;

  /**
   * Output audio tokens.
   */
  outputAudioTokens?: number;

  /**
   * Cached portion of the input text tokens (subset of `inputTextTokens`).
   */
  cachedInputTextTokens?: number;

  /**
   * Cached portion of the input audio tokens (subset of `inputAudioTokens`).
   */
  cachedInputAudioTokens?: number;

  /**
   * Audio duration in seconds. Populated for duration-billed transcription.
   */
  audioSeconds?: number;
};
