import type { Context } from '@ai-sdk/provider-utils';
import type { IncludedContext } from './telemetry-options';

/**
 * Returns a shallow copy of the runtime context with only top-level
 * properties marked for telemetry inclusion.
 */
export function filterIncludedContext<CONTEXT extends Context>({
  context,
  includeContext,
}: {
  context: CONTEXT;
  includeContext: IncludedContext<CONTEXT>;
}): Context {
  if (context == null) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(context).filter(
      ([key]) => includeContext?.[key as keyof CONTEXT] === true,
    ),
  );
}
