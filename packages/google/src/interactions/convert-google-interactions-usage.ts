import type { JSONObject, LanguageModelV4Usage } from '@ai-sdk/provider';
import { createNullLanguageModelUsage } from '@ai-sdk/provider-utils';
import type { GoogleInteractionsUsage } from './google-interactions-api';

export function convertGoogleInteractionsUsage(
  usage: GoogleInteractionsUsage | undefined | null,
): LanguageModelV4Usage {
  if (usage == null) {
    return createNullLanguageModelUsage();
  }

  const totalInput = usage.total_input_tokens ?? 0;
  const totalOutput = usage.total_output_tokens ?? 0;
  const totalThought = usage.total_thought_tokens ?? 0;
  const totalCached = usage.total_cached_tokens ?? 0;

  return {
    inputTokens: {
      total: usage.total_input_tokens ?? undefined,
      noCache:
        usage.total_input_tokens == null ? undefined : totalInput - totalCached,
      cacheRead: usage.total_cached_tokens ?? undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total:
        usage.total_output_tokens == null && usage.total_thought_tokens == null
          ? undefined
          : totalOutput + totalThought,
      text: usage.total_output_tokens ?? undefined,
      reasoning: usage.total_thought_tokens ?? undefined,
    },
    raw: usage as unknown as JSONObject,
  };
}

/**
 * Extracts the per-modality output token breakdown from an Interactions usage
 * record (e.g. `{ video: 57920, text: 12 }`).
 */
export function getGoogleInteractionsOutputTokensByModality(
  usage: GoogleInteractionsUsage | undefined | null,
): Record<string, number> | undefined {
  const byModality = usage?.output_tokens_by_modality;
  if (byModality == null) {
    return undefined;
  }

  const result: Record<string, number> = {};
  for (const entry of byModality) {
    if (entry?.modality != null && entry.tokens != null) {
      result[entry.modality] = entry.tokens;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

type GoogleInteractionsTokensByModality = NonNullable<
  GoogleInteractionsUsage['output_tokens_by_modality']
>;

/**
 * Sums the usage of the requests (hops) of a long decode response that was
 * continued client-side (Gemini 4). Each hop reports its own usage, and every
 * hop is billed, so the totals are added.
 */
export function addGoogleInteractionsUsage(
  a: GoogleInteractionsUsage | undefined,
  b: GoogleInteractionsUsage | undefined,
): GoogleInteractionsUsage | undefined {
  if (a == null || b == null) {
    return b ?? a;
  }

  return {
    ...a,
    ...b,
    total_input_tokens: addCounts(a.total_input_tokens, b.total_input_tokens),
    total_output_tokens: addCounts(
      a.total_output_tokens,
      b.total_output_tokens,
    ),
    total_thought_tokens: addCounts(
      a.total_thought_tokens,
      b.total_thought_tokens,
    ),
    total_cached_tokens: addCounts(
      a.total_cached_tokens,
      b.total_cached_tokens,
    ),
    total_tool_use_tokens: addCounts(
      a.total_tool_use_tokens,
      b.total_tool_use_tokens,
    ),
    total_tokens: addCounts(a.total_tokens, b.total_tokens),
    input_tokens_by_modality: addTokensByModality(
      a.input_tokens_by_modality,
      b.input_tokens_by_modality,
    ),
    output_tokens_by_modality: addTokensByModality(
      a.output_tokens_by_modality,
      b.output_tokens_by_modality,
    ),
    cached_tokens_by_modality: addTokensByModality(
      a.cached_tokens_by_modality,
      b.cached_tokens_by_modality,
    ),
    tool_use_tokens_by_modality: addTokensByModality(
      a.tool_use_tokens_by_modality,
      b.tool_use_tokens_by_modality,
    ),
  };
}

function addCounts(
  a: number | null | undefined,
  b: number | null | undefined,
): number | null | undefined {
  return a == null && b == null ? (b ?? a) : (a ?? 0) + (b ?? 0);
}

function addTokensByModality(
  a: GoogleInteractionsTokensByModality | null | undefined,
  b: GoogleInteractionsTokensByModality | null | undefined,
): GoogleInteractionsTokensByModality | null | undefined {
  if (a == null || b == null) {
    return b ?? a;
  }

  const tokens = new Map<string, number>();
  for (const entry of [...a, ...b]) {
    if (entry?.modality == null || entry.tokens == null) continue;
    tokens.set(
      entry.modality,
      (tokens.get(entry.modality) ?? 0) + entry.tokens,
    );
  }

  return Array.from(tokens, ([modality, count]) => ({
    modality,
    tokens: count,
  }));
}
