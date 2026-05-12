import type { JSONObject, LanguageModelV4Usage } from '@ai-sdk/provider';

/**
 * Represents a single iteration in the usage breakdown.
 *
 * - `compaction` / `message`: executor iterations, billed at executor rates.
 * - `advisor_message`: advisor sub-inference, billed at the advisor model's
 *   rates. The `model` field carries the advisor model ID. Advisor tokens
 *   are NOT rolled into the top-level totals because they bill at a
 *   different rate; inspect this array for advisor cost tracking.
 */
export type AnthropicUsageIteration =
  | {
      type: 'compaction' | 'message';
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number | null;
      cache_read_input_tokens?: number | null;
    }
  | {
      type: 'advisor_message';
      model: string;
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number | null;
      cache_read_input_tokens?: number | null;
    };

export type AnthropicUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  /**
   * When compaction is triggered or the advisor tool is invoked, this
   * array contains usage for each sampling iteration. Top-level
   * input_tokens and output_tokens exclude compaction iteration usage,
   * and the advisor sub-inference is also not rolled into the top-level
   * totals because it bills at a different rate. Use this array for
   * per-iteration cost tracking.
   */
  iterations?: AnthropicUsageIteration[] | null;
};

export function convertAnthropicUsage({
  usage,
  rawUsage,
}: {
  usage: AnthropicUsage;
  rawUsage?: JSONObject;
}): LanguageModelV4Usage {
  const cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;

  // When iterations is present (compaction or advisor), sum across executor
  // iterations to get the true executor totals. The top-level input_tokens
  // and output_tokens exclude compaction usage. Advisor (`advisor_message`)
  // iterations are filtered out: they bill at the advisor model's rates,
  // not the executor's, so they don't belong in the top-level totals.
  let inputTokens: number;
  let outputTokens: number;

  if (usage.iterations && usage.iterations.length > 0) {
    const executorIterations = usage.iterations.filter(
      iter => iter.type === 'compaction' || iter.type === 'message',
    );

    if (executorIterations.length > 0) {
      const totals = executorIterations.reduce(
        (acc, iter) => ({
          input: acc.input + iter.input_tokens,
          output: acc.output + iter.output_tokens,
        }),
        { input: 0, output: 0 },
      );
      inputTokens = totals.input;
      outputTokens = totals.output;
    } else {
      inputTokens = usage.input_tokens;
      outputTokens = usage.output_tokens;
    }
  } else {
    inputTokens = usage.input_tokens;
    outputTokens = usage.output_tokens;
  }

  return {
    inputTokens: {
      total: inputTokens + cacheCreationTokens + cacheReadTokens,
      noCache: inputTokens,
      cacheRead: cacheReadTokens,
      cacheWrite: cacheCreationTokens,
    },
    outputTokens: {
      total: outputTokens,
      text: undefined,
      reasoning: undefined,
    },
    raw: rawUsage ?? usage,
  };
}
