/**
 * Normalized realtime usage on completion events or provider custom snapshots.
 * Snapshots without a response association must not be summed as increments.
 *
 * Counts are the provider's raw counts: the input buckets INCLUDE any cached
 * tokens, and the cached portions are reported separately in
 * `cachedInput*Tokens`. This mirrors how providers report realtime usage on the
 * wire and lets a consumer apply its own cached-vs-uncached billing split
 * without re-parsing the event's `raw` payload.
 *
 * Every field is optional: providers only populate what they actually report,
 * and the whole `usage` object is omitted when nothing is observable. Gross
 * totals can include modalities without a dedicated text/audio bucket.
 */
export type RealtimeModelV4Usage = {
  /** Gross input tokens across all reported modalities; includes cached tokens. */
  inputTokens?: number;

  /** Gross output tokens across all reported modalities. */
  outputTokens?: number;

  /** Cached portion of gross input tokens, when the provider reports a total. */
  cachedInputTokens?: number;

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
  seconds?: number;
};
