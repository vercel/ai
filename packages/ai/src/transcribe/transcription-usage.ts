import type { JSONObject } from '@ai-sdk/provider';

/**
 * Normalized transcription usage.
 *
 * Providers report usage under different field names. `transcribe()` maps the
 * common token counters onto this shape and keeps the provider object on `raw`.
 */
export type TranscriptionUsage = {
  /**
   * Input or prompt tokens, when the provider reports them.
   */
  inputTokens: number | undefined;

  /**
   * Output or completion tokens, when the provider reports them.
   */
  outputTokens: number | undefined;

  /**
   * Total tokens, when the provider reports them or both sides are present.
   */
  totalTokens: number | undefined;

  /**
   * Usage object returned by the provider, including fields that are not
   * token counts (for example billed audio seconds).
   */
  raw?: JSONObject;
};

const inputTokenKeys = [
  'inputTokens',
  'input_tokens',
  'prompt_tokens',
  'promptTokenCount',
  'prompt_token_count',
  'total_input_tokens',
] as const;

const outputTokenKeys = [
  'outputTokens',
  'output_tokens',
  'completion_tokens',
  'candidatesTokenCount',
  'candidates_token_count',
  'total_output_tokens',
] as const;

const totalTokenKeys = [
  'totalTokens',
  'total_tokens',
  'totalTokenCount',
  'total_token_count',
] as const;

function readToken(
  usage: JSONObject,
  keys: readonly string[],
): number | undefined {
  for (const key of keys) {
    const value = usage[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

/**
 * Maps a provider transcription usage object onto common token counters.
 * Returns undefined when the provider did not report usage.
 */
export function asTranscriptionUsage(
  usage: JSONObject | undefined,
): TranscriptionUsage | undefined {
  if (usage == null) {
    return undefined;
  }

  const inputTokens = readToken(usage, inputTokenKeys);
  const outputTokens = readToken(usage, outputTokenKeys);
  const reportedTotal = readToken(usage, totalTokenKeys);
  const totalTokens =
    reportedTotal ??
    (inputTokens != null && outputTokens != null
      ? inputTokens + outputTokens
      : undefined);

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    raw: usage,
  };
}
