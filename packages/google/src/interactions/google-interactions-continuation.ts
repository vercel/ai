import type {
  GoogleInteractionsResponse,
  GoogleInteractionsUsage,
} from './google-interactions-api';
import type { GoogleInteractionsRequestBody } from './google-interactions-prompt';

/** Keep the cumulative budget and settings unchanged on every hop. */
export function googleInteractionsContinuationBody(
  original: GoogleInteractionsRequestBody,
  continuationToken: string,
  interactionId: string | undefined,
): GoogleInteractionsRequestBody {
  if (original.store === false) {
    return { ...original, continuation_token: continuationToken };
  }
  if (interactionId == null || interactionId.length === 0) {
    throw new Error(
      'google.interactions: a stored continuation requires the interaction id that issued its token.',
    );
  }
  const { input: _input, ...settings } = original;
  return {
    ...settings,
    previous_interaction_id: interactionId,
    continuation_token: continuationToken,
  };
}

/** Usage snapshots within a hop replace one another; only separate hops add. */
export function addGoogleInteractionsUsage(
  previous: GoogleInteractionsUsage | null | undefined,
  next: GoogleInteractionsUsage | null | undefined,
): GoogleInteractionsUsage | undefined {
  if (previous == null) return next ?? undefined;
  if (next == null) return previous;

  const merged: GoogleInteractionsUsage = {
    ...previous,
    ...next,
    initial_input_tokens:
      previous.initial_input_tokens ?? previous.total_input_tokens,
  };
  for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
    const value = next[key];
    const previousValue = previous[key];
    if (
      key !== 'initial_input_tokens' &&
      (typeof value === 'number' || typeof previousValue === 'number')
    ) {
      merged[key] =
        (typeof previousValue === 'number' ? previousValue : 0) +
        (typeof value === 'number' ? value : 0);
    }
  }
  for (const key of [
    'input_tokens_by_modality',
    'output_tokens_by_modality',
    'cached_tokens_by_modality',
    'tool_use_tokens_by_modality',
  ] as const) {
    if (previous[key] == null || next[key] == null) {
      merged[key] = next[key] ?? previous[key];
      continue;
    }
    const entries = new Map<
      string | null | undefined,
      NonNullable<GoogleInteractionsUsage[typeof key]>[number]
    >();
    for (const entry of [...previous[key], ...next[key]]) {
      const existing = entries.get(entry.modality);
      entries.set(entry.modality, {
        ...entry,
        tokens:
          entry.tokens == null
            ? existing?.tokens
            : (existing?.tokens ?? 0) + entry.tokens,
      });
    }
    merged[key] = [...entries.values()];
  }
  if (
    previous.grounding_tool_count != null &&
    next.grounding_tool_count != null
  ) {
    const entries = new Map<
      string | null | undefined,
      NonNullable<GoogleInteractionsUsage['grounding_tool_count']>[number]
    >();
    for (const entry of [
      ...previous.grounding_tool_count,
      ...next.grounding_tool_count,
    ]) {
      const existing = entries.get(entry.type);
      entries.set(entry.type, {
        ...entry,
        count:
          entry.count == null
            ? existing?.count
            : (existing?.count ?? 0) + entry.count,
      });
    }
    merged.grounding_tool_count = [...entries.values()];
  } else {
    merged.grounding_tool_count =
      next.grounding_tool_count ?? previous.grounding_tool_count;
  }
  return merged;
}

export function mergeGoogleInteractionsResponses(
  previous: GoogleInteractionsResponse,
  next: GoogleInteractionsResponse,
): GoogleInteractionsResponse {
  // Later hops can repeat the original input. Keep it only once in the merged turn.
  const steps = next.steps ?? [];
  const firstOutput = steps.findIndex(step => step.type !== 'user_input');
  return {
    ...next,
    input: previous.input,
    created: previous.created,
    previous_interaction_id: previous.previous_interaction_id,
    steps: [
      ...(previous.steps ?? []),
      ...steps.slice(firstOutput < 0 ? steps.length : firstOutput),
    ],
    usage: addGoogleInteractionsUsage(previous.usage, next.usage),
  };
}
