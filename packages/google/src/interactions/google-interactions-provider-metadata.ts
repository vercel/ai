/**
 * Provider-metadata shape that the Gemini Interactions language model writes
 * onto `result.providerMetadata.google` (and reads back from input messages on
 * the next turn for stateful chaining and signature round-trip).
 */
export type GoogleInteractionsProviderMetadata = {
  /**
   * Gemini-server-side interaction id (`Interaction.id`). Pass back in
   * `providerOptions.google.previousInteractionId` to chain stateful turns.
   */
  interactionId?: string;

  /**
   * Service tier used for this interaction (passthrough for observability).
   */
  serviceTier?: string;

  /**
   * Output token counts keyed by modality (e.g. `{ video: 57920 }`), sourced
   * from the Interactions API `output_tokens_by_modality`. Present only when
   * the response reports a breakdown. Preview surface for per-modality billing;
   * may be promoted to a first-class usage field later.
   */
  outputTokensByModality?: Record<string, number>;

  /**
   * Gemini 4 long decode: opaque token returned when the response stopped
   * before finishing — status `incomplete` (the `maxOutputTokens` budget was
   * used up), `requires_continuation` (manual mode or continuing failed), or
   * `interrupted` (a stream stopped after a resumable checkpoint).
   * Pass it back as `providerOptions.google.continuationToken` together with
   * `previousInteractionId: interactionId` (and a higher `maxOutputTokens`
   * for `incomplete`) to resume generation.
   */
  continuationToken?: string;

  /**
   * Gemini 4 long decode: `total_input_tokens` of the first request of a
   * response that was continued automatically across several requests. Usage
   * is summed across requests to match billing, and each continued request
   * re-sends the prompt plus all output so far as input. Use this value
   * instead of the summed input tokens for context window checks and
   * compaction. Only present when the response spanned more than one request.
   */
  initialInputTokens?: number;

  /**
   * Per-block signature hash for backend validation. Set by the SDK on output
   * reasoning / tool-call parts and round-tripped on input parts.
   */
  signature?: string;

  /**
   * ID of an agentic video `processing_call` step. Present on
   * `google.processing_call` custom parts.
   */
  processingId?: string;

  /**
   * ID of the corresponding agentic video processing call. Present on
   * `google.processing_result` custom parts.
   */
  processingCallId?: string;
};
