import type { JSONObject, LanguageModelV3Usage } from '@ai-sdk/provider';
import type { GoogleInteractionsUsage } from './google-interactions-api';

export function convertGoogleInteractionsUsage(
  usage: GoogleInteractionsUsage | undefined | null,
): LanguageModelV3Usage {
  if (usage == null) {
    return {
      inputTokens: {
        total: undefined,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: undefined,
        text: undefined,
        reasoning: undefined,
      },
      raw: undefined,
    };
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

/**
 * Sums the usage of two interactions, e.g. the requests of a long decode
 * response that was continued automatically.
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

type TokensByModality = GoogleInteractionsUsage['output_tokens_by_modality'];

function addTokensByModality(
  a: TokensByModality,
  b: TokensByModality,
): TokensByModality {
  if (a == null || b == null) {
    return b ?? a;
  }

  const tokens = new Map<string | null | undefined, number>();
  for (const entry of [...a, ...b]) {
    tokens.set(
      entry.modality,
      (tokens.get(entry.modality) ?? 0) + (entry.tokens ?? 0),
    );
  }

  return Array.from(tokens, ([modality, count]) => ({
    modality,
    tokens: count,
  }));
}
